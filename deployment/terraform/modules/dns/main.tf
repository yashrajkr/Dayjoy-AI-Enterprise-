# Terraform — Route53 + ACM DNS Module
# Creates a Route53 alias record pointing at the ALB and an ACM certificate
# validated via DNS. The certificate uses create_before_destroy so re-issuance
# does not break the active ingress.

variable "domain_name"   { type = string }
variable "zone_id"       { type = string }
variable "alb_dns_name"  { type = string }
variable "alb_zone_id"   { type = string }

resource "aws_route53_record" "app" {
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_acm_certificate" "app" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle { create_before_destroy = true }

  tags = { Name = var.domain_name }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.app.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.zone_id
}

resource "aws_acm_certificate_validation" "app" {
  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

output "certificate_arn" { value = aws_acm_certificate.app.arn }
