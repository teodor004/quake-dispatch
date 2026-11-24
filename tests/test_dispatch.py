"""Unit tests for dispatch.py (automated emergency voice call Lambda)."""

import json
import urllib.error

import dispatch


def _sns_event(alert):
    return {
        "Records": [
            {
                "Sns": {
                    "Message": json.dumps(alert),
                }
            }
        ]
    }


class _FakeHttpResponse:
    def __init__(self, payload):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self._payload).encode("utf-8")


def test_skips_when_destination_not_configured(monkeypatch):
    monkeypatch.delenv("DISPATCH_TO_NUMBER", raising=False)
    resp = dispatch.lambda_handler(_sns_event({"zone_id": "46.77_23.62"}), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["status"] == "skipped"


def test_resolve_area_formats_neighborhood_and_city_and_sends_headers(monkeypatch):
    captured = {}

    def fake_urlopen(req, timeout=2.5):
        captured["url"] = req.full_url
        captured["ua"] = req.get_header("User-agent")
        captured["lang"] = req.get_header("Accept-language")
        captured["timeout"] = timeout
        return _FakeHttpResponse(
            {
                "address": {
                    "suburb": "Mărăști",
                    "city": "Cluj-Napoca",
                    "country": "Romania",
                }
            }
        )

    monkeypatch.setattr(dispatch.urllib.request, "urlopen", fake_urlopen)

    area = dispatch.resolve_area(46.7712, 23.6236)
    assert area == "the Mărăști area of Cluj-Napoca"
    assert "nominatim.openstreetmap.org/reverse" in captured["url"]
    assert "zoom=14" in captured["url"]
    assert captured["ua"] == "QuakeDispatch-EarthquakeAlert/1.0"
    assert captured["lang"] == "en"
    assert captured["timeout"] == 2.5


def test_build_dispatch_text_uses_resolved_area_name(monkeypatch):
    def fake_urlopen(req, timeout=2.5):
        return _FakeHttpResponse(
            {
                "address": {
                    "neighbourhood": "Mărăști",
                    "city": "Cluj-Napoca",
                }
            }
        )

    monkeypatch.setattr(dispatch.urllib.request, "urlopen", fake_urlopen)

    text = dispatch.format_announcement(
        {
            "zone_id": "46.77_23.62",
            "lat": 46.7712,
            "lon": 23.6236,
            "max_pga": 4.25,
            "triggered_devices": ["ios-01", "android-68"],
        }
    )
    assert "near the Mărăști area of Cluj-Napoca." in text
    assert "4.25 meters per second squared" in text
    assert "confirmed by 2 sensors" in text


def test_build_dispatch_text_falls_back_to_coordinates_on_geocode_error(monkeypatch):
    def fake_urlopen(req, timeout=2.5):
        raise urllib.error.URLError("timeout")

    monkeypatch.setattr(dispatch.urllib.request, "urlopen", fake_urlopen)

    text = dispatch.build_dispatch_text(
        {
            "zone_id": "46.77_23.62",
            "lat": 46.7712,
            "lon": 23.6236,
            "max_pga": 4.25,
            "triggered_devices": ["ios-01", "android-68"],
        }
    )
    assert "46.77 north, 23.62 east" in text
    assert "4.25 meters per second squared" in text
    assert "confirmed by 2 sensors" in text


def test_twilio_dispatch_posts_twiml_with_basic_auth(monkeypatch):
    monkeypatch.setenv("DISPATCH_PROVIDER", "twilio")
    monkeypatch.setenv("DISPATCH_TO_NUMBER", "+40712345678")
    monkeypatch.setenv("DISPATCH_FROM_NUMBER", "+15005550006")
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC_TEST_SID")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "TEST_TOKEN")
    monkeypatch.setenv("DISPATCH_DRY_RUN", "0")

    captured = {}

    def fake_urlopen(req, timeout=10):
        if "nominatim.openstreetmap.org" in req.full_url:
            return _FakeHttpResponse({"address": {"suburb": "Gheorgheni", "city": "Cluj-Napoca"}})
        captured["url"] = req.full_url
        captured["auth"] = req.get_header("Authorization")
        captured["data"] = req.data.decode("utf-8")
        return _FakeHttpResponse({"sid": "CA123", "status": "queued"})

    monkeypatch.setattr(dispatch.urllib.request, "urlopen", fake_urlopen)

    resp = dispatch.lambda_handler(
        _sns_event({"lat": 46.77, "lon": 23.62, "max_pga": 3.8, "triggered_devices": ["ios-1", "ios-2"]}),
        None,
    )
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["calls"][0]["call_sid"] == "CA123"
    assert "Accounts/AC_TEST_SID/Calls.json" in captured["url"]
    assert captured["auth"].startswith("Basic ")
    assert "Twiml=" in captured["data"]
    assert "Gheorgheni" in captured["data"]


def test_aws_voice_dispatch_calls_pinpoint_sms_voice_v2():
    calls = []

    class FakeVoiceClient:
        def send_voice_message(self, **kwargs):
            calls.append(kwargs)
            return {"MessageId": "aws-msg-1"}

    res = dispatch._call_via_aws_voice(
        to_number="+12065550100",
        from_number="+12065550199",
        message_text="Earthquake detected.",
        dry_run=True,
        voice_client=FakeVoiceClient(),
    )
    assert res["message_id"] == "aws-msg-1"
    assert calls[0]["DestinationPhoneNumber"] == "+12065550100"
    assert calls[0]["MessageBodyTextType"] == "SSML"
    assert calls[0]["DryRun"] is True
