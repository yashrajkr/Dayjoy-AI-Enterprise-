# =============================================================================
# Dayjoy n8n — Terraform outputs
# =============================================================================

output "n8n_instance_id" {
  description = "EC2 instance ID of the n8n host."
  value       = aws_instance.n8n_host.id
}

output "n8n_instance_private_ip" {
  description = "Private IP of the n8n host (use from within the VPC)."
  value       = aws_instance.n8n_host.private_ip
}

output "n8n_instance_public_dns" {
  description = "Public DNS name of the n8n host (rarely used — ALB is the entry point)."
  value       = aws_instance.n8n_host.public_dns
}

output "n8n_alb_dns_name" {
  description = "DNS name of the n8n ALB (use this as the Cloudflare CNAME target)."
  value       = aws_lb.n8n.dns_name
}

output "n8n_alb_zone_id" {
  description = "Route53 zone ID of the ALB (for alias records if not using Cloudflare)."
  value       = aws_lb.n8n.zone_id
}

output "n8n_url" {
  description = "Public URL of the n8n instance."
  value       = "https://n8n.dayjoy.ai"
}

output "n8n_health_endpoint" {
  description = "Health check endpoint (internal — only reachable from within the VPC or via the ALB)."
  value       = "http://${aws_instance.n8n_host.private_ip}:5678/healthz"
}

output "n8n_target_group_arn" {
  description = "ALB target group ARN for the n8n host."
  value       = aws_lb_target_group.n8n.arn
}

output "n8n_security_group_id" {
  description = "Security group ID of the n8n host (for cross-stack references)."
  value       = aws_security_group.n8n_host.id
}

output "n8n_alb_security_group_id" {
  description = "Security group ID of the n8n ALB."
  value       = aws_security_group.alb.id
}

output "n8n_iam_role_arn" {
  description = "IAM role ARN of the n8n host (for cross-stack references)."
  value       = aws_iam_role.n8n_host.arn
}

output "n8n_iam_instance_profile_name" {
  description = "IAM instance profile name attached to the n8n host."
  value       = aws_iam_instance_profile.n8n_host.name
}

output "cloudflare_record_id" {
  description = "Cloudflare DNS record ID for n8n.dayjoy.ai."
  value       = cloudflare_record.n8n.id
}

# -----------------------------------------------------------------------------
# Useful for `terraform output` debugging
# -----------------------------------------------------------------------------
output "deployment_summary" {
  description = "Human-readable summary of what was deployed."
  value = {
    environment     = var.environment
    region          = var.aws_region
    instance_type   = var.instance_type
    n8n_version     = var.n8n_version
    n8n_url         = "https://n8n.dayjoy.ai"
    alb_dns         = aws_lb.n8n.dns_name
    instance_id     = aws_instance.n8n_host.id
    private_ip      = aws_instance.n8n_host.private_ip
    backup_bucket   = var.backup_bucket_name
    cloudwatch_logs = "/dayjoy/n8n/host"
  }
}
