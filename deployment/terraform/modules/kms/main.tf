# Terraform — AWS KMS Module
# Centralized KMS key used by RDS, S3, ElastiCache, Secrets Manager.
# Key rotation is enabled; root account retains full KMS access.

resource "aws_kms_key" "dayjoy" {
  description             = "Dayjoy AI Enterprise KMS key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })
}

resource "aws_kms_alias" "dayjoy" {
  name          = "alias/dayjoy"
  target_key_id = aws_kms_key.dayjoy.key_id
}

data "aws_caller_identity" "current" {}

output "kms_key_arn" { value = aws_kms_key.dayjoy.arn }
output "kms_key_id"  { value = aws_kms_key.dayjoy.key_id }
