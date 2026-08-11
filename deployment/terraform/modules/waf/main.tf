# Terraform — AWS WAF v2 Module (regional, for ALB)
# Protects the Dayjoy ALB with:
#   1. Rate limiting (2000 req / 5 min / IP)
#   2. AWS Managed Rules Common Rule Set (count mode)
#   3. AWS Managed Rules SQLi Rule Set (count mode)
# Managed rules ship in count mode initially — promote to block once baseline traffic is established.

resource "aws_wafv2_web_acl" "dayjoy" {
  name        = "dayjoy-waf"
  description = "Dayjoy WAF"
  scope       = "REGIONAL"

  default_action { allow {} }

  rule {
    name     = "rate-limit"
    priority = 1
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "rate-limit"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-managed-rules"
    priority = 2
    override_action { count {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "aws-managed-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "sql-injection"
    priority = 3
    override_action { count {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "sql-injection"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "dayjoy-waf"
    sampled_requests_enabled   = true
  }

  tags = { Name = "dayjoy-waf" }
}

output "waf_arn" { value = aws_wafv2_web_acl.dayjoy.arn }
output "waf_id"  { value = aws_wafv2_web_acl.dayjoy.id }
