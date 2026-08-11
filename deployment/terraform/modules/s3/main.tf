# Terraform — S3 Bucket Module (backups + media)
# Encrypted backups bucket with versioning, lifecycle transition to Glacier,
# and a public access block. KMS-encrypted at rest using the shared dayjoy key.

variable "kms_key_id"  { type = string }
variable "environment" { type = string }

resource "aws_s3_bucket" "backups" {
  bucket = "dayjoy-${var.environment}-backups"
  tags   = { Name = "dayjoy-backups" }
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_id
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    id     = "transition-to-glacier"
    status = "Enabled"
    filter { prefix = "" }
    transition {
      days          = 30
      storage_class = "GLACIER"
    }
    expiration { days = 365 }
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "bucket_arn"  { value = aws_s3_bucket.backups.arn }
output "bucket_name" { value = aws_s3_bucket.backups.id }
