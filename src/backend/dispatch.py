"""Automated emergency dispatch voice-call Lambda subscribed to SNS quake-alerts-topic.

Supports two providers via DISPATCH_PROVIDER env var:
  - "twilio" (default, easiest for +40 Romania via Twilio Free Trial, pure stdlib urllib)
  - "aws"    (AWS End User Messaging Voice / pinpoint-sms-voice-v2 with Amazon Polly SSML)
"""

import base64
import json
import os
import urllib.parse
import urllib.request
from xml.sax.saxutils import escape

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_USER_AGENT = "QuakeDispatch-EarthquakeAlert/1.0"
AREA_KEYS = ("neighbourhood", "suburb", "quarter", "city_district", "village")
CITY_KEYS = ("city", "town", "municipality", "county")


def resolve_area(lat, lon, timeout=2.5):
    """Reverse-geocode (lat, lon) via OpenStreetMap Nominatim; return None on any error."""
    try:
        query = urllib.parse.urlencode(
            {
                "format": "jsonv2",
                "lat": f"{float(lat):.6f}",
                "lon": f"{float(lon):.6f}",
                "zoom": "14",
                "addressdetails": "1",
            }
        )
        req = urllib.request.Request(
            f"{NOMINATIM_URL}?{query}",
            headers={
                "User-Agent": NOMINATIM_USER_AGENT,
                "Accept-Language": "en",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        address = data.get("address") if isinstance(data, dict) else None
        if not isinstance(address, dict):
            return None

        area = next((str(address[k]).strip() for k in AREA_KEYS if address.get(k)), "")
        city = next((str(address[k]).strip() for k in CITY_KEYS if address.get(k)), "")

        if area and city and area.lower() != city.lower():
            return f"the {area} area of {city}"
        return area or city or None
    except Exception:
        return None


def build_dispatch_text(alert):
    """Build a spoken emergency dispatch announcement from a DetectedEvents SNS alert."""
    lat = alert.get("lat")
    lon = alert.get("lon")
    zone_id = alert.get("zone_id", "unknown zone")
    max_pga = alert.get("max_pga")
    devices = alert.get("triggered_devices") or []
    device_count = len(devices) if isinstance(devices, list) else 1

    if lat is not None and lon is not None:
        area_name = resolve_area(lat, lon)
        if area_name:
            loc_phrase = area_name
        else:
            loc_phrase = f"coordinates {float(lat):.2f} north, {float(lon):.2f} east"
    else:
        loc_phrase = f"zone {zone_id}"

    pga_phrase = (
        f"Peak ground acceleration {float(max_pga):.2f} meters per second squared, "
        if max_pga is not None
        else ""
    )
    sensor_word = "sensor" if device_count == 1 else "sensors"

    return (
        f"Emergency dispatch alert. An earthquake has been detected near {loc_phrase}. "
        f"{pga_phrase}confirmed by {device_count} {sensor_word}. "
        "Your registered contact may be in the affected area. "
        "Please check immediately if assistance is required."
    )


format_announcement = build_dispatch_text


def _call_via_twilio(to_number, from_number, message_text, dry_run=False):
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    if not account_sid or not auth_token or not from_number:
        raise ValueError("Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or DISPATCH_FROM_NUMBER")

    voice = os.environ.get("DISPATCH_VOICE_ID", "Polly.Joanna")
    twiml = f'<Response><Say voice="{escape(voice)}">{escape(message_text)}</Say></Response>'

    if dry_run:
        return {"provider": "twilio", "dry_run": True, "to": to_number, "twiml": twiml}

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Calls.json"
    form_data = urllib.parse.urlencode(
        {
            "To": to_number,
            "From": from_number,
            "Twiml": twiml,
        }
    ).encode("utf-8")

    token = base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("ascii")
    req = urllib.request.Request(
        url,
        data=form_data,
        headers={
            "Authorization": f"Basic {token}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=10) as resp:
        body = json.loads(resp.read().decode("utf-8"))
        return {"provider": "twilio", "call_sid": body.get("sid"), "status": body.get("status")}


def _call_via_aws_voice(to_number, from_number, message_text, dry_run=False, voice_client=None):
    if not from_number:
        raise ValueError("Missing DISPATCH_FROM_NUMBER (AWS origination phone number)")

    if voice_client is None:
        import boto3

        voice_client = boto3.client("pinpoint-sms-voice-v2")

    voice_id = os.environ.get("DISPATCH_VOICE_ID", "Joanna").replace("Polly.", "")
    ssml = (
        "<speak><emphasis level='strong'>Emergency dispatch alert.</emphasis> "
        f"<break time='400ms'/>{escape(message_text)}</speak>"
    )

    resp = voice_client.send_voice_message(
        DestinationPhoneNumber=to_number,
        OriginationIdentity=from_number,
        MessageBody=ssml,
        MessageBodyTextType="SSML",
        VoiceId=voice_id,
        MaxPricePerMinute=os.environ.get("DISPATCH_MAX_PRICE_PER_MIN", "0.10"),
        DryRun=dry_run,
    )
    return {"provider": "aws", "dry_run": dry_run, "message_id": resp.get("MessageId")}


def _parse_alert_message(raw_message):
    if isinstance(raw_message, dict):
        return raw_message
    try:
        parsed = json.loads(raw_message)
        return parsed if isinstance(parsed, dict) else {"raw": raw_message}
    except (TypeError, ValueError):
        return {"raw": str(raw_message)}


def lambda_handler(event, context):
    to_number = os.environ.get("DISPATCH_TO_NUMBER", "").strip()
    if not to_number:
        print("DISPATCH_SKIPPED: DISPATCH_TO_NUMBER is not configured")
        return {"statusCode": 200, "body": json.dumps({"status": "skipped", "reason": "DISPATCH_TO_NUMBER not set"})}

    from_number = os.environ.get("DISPATCH_FROM_NUMBER", "").strip()
    provider = os.environ.get("DISPATCH_PROVIDER", "twilio").strip().lower()
    dry_run = os.environ.get("DISPATCH_DRY_RUN", "0") == "1"

    records = event.get("Records") or []
    results = []

    for rec in records:
        sns_msg = (rec.get("Sns") or {}).get("Message", "{}")
        alert = _parse_alert_message(sns_msg)
        text = build_dispatch_text(alert)

        if provider == "aws":
            res = _call_via_aws_voice(to_number, from_number, text, dry_run=dry_run)
        else:
            res = _call_via_twilio(to_number, from_number, text, dry_run=dry_run)

        print("DISPATCH_SENT", json.dumps(res))
        results.append(res)

    return {"statusCode": 200, "body": json.dumps({"status": "ok", "calls": results})}
