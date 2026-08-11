# =============================================================================
# Dayjoy n8n — Terraform variables
# =============================================================================

variable "aws_region" {
  description = "AWS region for all resources. ap-south-1 (Mumbai) for data residency."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment (production / staging)."
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "Environment must be 'production' or 'staging'."
  }
}

variable "instance_type" {
  description = "EC2 instance type. t3.large (2 vCPU/8GB) is the minimum for production."
  type        = string
  default     = "t3.xlarge" # 4 vCPU / 16 GB — recommended for production

  validation {
    condition = contains([
      "t3.large", "t3.xlarge", "t3.2xlarge",
      "m5.large", "m5.xlarge", "m5.2xlarge",
      "m6i.large", "m6i.xlarge", "m6i.2xlarge"
    ], var.instance_type)
    error_message = "instance_type must be t3/m5/m6i large or bigger."
  }
}

variable "n8n_version" {
  description = "Pinned n8n version (Docker tag). Update via CI/CD, NOT here directly."
  type        = string
  default     = "1.62.0"
}

variable "dayjoy_api_url" {
  description = "Dayjoy backend API base URL."
  type        = string
  default     = "https://api.dayjoy.ai"
}

variable "backup_bucket_name" {
  description = "S3 bucket name for n8n backups (n8n_data + Postgres dumps)."
  type        = string
  default     = "dayjoy-n8n-backups"
}

variable "ebs_kms_key_id" {
  description = "KMS key ID (alias or ARN) for encrypting the EBS root volume."
  type        = string
  default     = "alias/dayjoy-n8n-ebs"
}

variable "bastion_security_group_id" {
  description = "Security group ID of the bastion host (SSH access)."
  type        = string
}

variable "platform_db_security_group_id" {
  description = "Security group ID of the platform Postgres (RDS). n8n egress to 5432 is allowed here."
  type        = string
}

variable "platform_redis_security_group_id" {
  description = "Security group ID of the platform Redis (ElastiCache). n8n egress to 6379 is allowed here."
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for the ALB HTTPS listener. Must cover n8n.dayjoy.ai."
  type        = string
}

variable "alb_access_log_bucket" {
  description = "S3 bucket name for ALB access logs."
  type        = string
  default     = "dayjoy-alb-access-logs"
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for dayjoy.ai."
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS edit permission on the dayjoy.ai zone."
  type        = string
  sensitive   = true
}

variable "pagerduty_sns_topic_arn" {
  description = "SNS topic ARN that forwards to PagerDuty. Used for CloudWatch alarm actions."
  type        = string
}
