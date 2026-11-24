# Dashboard-ul (src/web/quake-dispatch): fisiere statice in S3 privat, servite prin CloudFront (HTTPS).
# Fisierele le urca workflow-ul de deploy (aws s3 sync), nu Terraform.

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "dashboard" {
  bucket        = "quakemeup-dashboard-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket                  = aws_s3_bucket.dashboard.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "dashboard" {
  name                              = "quakemeup-dashboard"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  comment             = "QuakeMeUp dashboard"
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # Europa + America de Nord: cel mai ieftin

  origin {
    origin_id                = "dashboard-s3"
    domain_name              = aws_s3_bucket.dashboard.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard.id
  }

  default_cache_behavior {
    target_origin_id       = "dashboard-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  }

  # Aplicatie single-page: orice cale necunoscuta intoarce index.html
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Doar CloudFront (aceasta distributie) poate citi din bucket
resource "aws_s3_bucket_policy" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.dashboard.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.dashboard.arn }
      }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.dashboard]
}

output "dashboard_bucket" {
  value = aws_s3_bucket.dashboard.bucket
}

output "dashboard_distribution_id" {
  value = aws_cloudfront_distribution.dashboard.id
}

output "dashboard_url" {
  value = "https://${aws_cloudfront_distribution.dashboard.domain_name}"
}
