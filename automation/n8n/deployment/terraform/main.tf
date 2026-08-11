# =============================================================================
# Dayjoy n8n — Terraform: EC2 instance + security groups for the n8n host.
# Region: ap-south-1 (Mumbai) for data residency compliance.
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.20"
    }
  }

  # Backend: S3 + DynamoDB for state locking
  backend "s3" {
    bucket         = "dayjoy-terraform-state"
    key            = "n8n/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "dayjoy-terraform-locks"
    encrypt        = true
  }
}

# -----------------------------------------------------------------------------
# Providers
# -----------------------------------------------------------------------------
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "dayjoy-ai-enterprise"
      Component   = "n8n"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = "platform-team"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# -----------------------------------------------------------------------------
# Data sources
# -----------------------------------------------------------------------------
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
  filter {
    name   = "region-name"
    values = [var.aws_region]
  }
}

# Latest Ubuntu 22.04 AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# -----------------------------------------------------------------------------
# VPC + Subnets (uses the shared Dayjoy VPC)
# -----------------------------------------------------------------------------
data "aws_vpc" "dayjoy" {
  filter {
    name   = "tag:Name"
    values = ["dayjoy-vpc"]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.dayjoy.id]
  }
  filter {
    name   = "tag:Tier"
    values = ["private"]
  }
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.dayjoy.id]
  }
  filter {
    name   = "tag:Tier"
    values = ["public"]
  }
}

# -----------------------------------------------------------------------------
# Security Groups
# -----------------------------------------------------------------------------
# ALB security group — public ingress on 80/443
resource "aws_security_group" "alb" {
  name        = "dayjoy-n8n-alb-sg"
  description = "Allow public HTTP/HTTPS to the n8n ALB"
  vpc_id      = data.aws_vpc.dayjoy.id

  ingress {
    description = "HTTP from anywhere (redirects to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# EC2 host security group — only ALB can reach 80/443, only bastion can SSH
resource "aws_security_group" "n8n_host" {
  name        = "dayjoy-n8n-host-sg"
  description = "Allow ALB + bastion ingress; restrict egress to known endpoints"
  vpc_id      = data.aws_vpc.dayjoy.id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "HTTPS from ALB"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "SSH from bastion only"
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [var.bastion_security_group_id]
  }

  # Internal healthz from the ALB
  ingress {
    description     = "n8n healthz from ALB"
    from_port       = 5678
    to_port         = 5678
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "HTTPS to anywhere (API calls to WhatsApp, SendGrid, Razorpay, Google, Slack, PagerDuty)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS (UDP) to VPC DNS"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "SMTP to SendGrid"
    from_port   = 587
    to_port     = 587
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Internal: Postgres (5432) + Redis (6379) on the platform SG
  egress {
    description     = "Postgres"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.platform_db_security_group_id]
  }

  egress {
    description     = "Redis"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.platform_redis_security_group_id]
  }
}

# -----------------------------------------------------------------------------
# IAM role + instance profile
# -----------------------------------------------------------------------------
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "n8n_host" {
  name               = "dayjoy-n8n-host-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# Allow the host to read secrets from AWS Secrets Manager (for n8n encryption key + app secrets)
data "aws_iam_policy_document" "secrets_access" {
  statement {
    sid    = "ReadN8nSecrets"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]
    resources = [
      "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:dayjoy/n8n/*"
    ]
  }
  statement {
    sid       = "ListSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:ListSecrets"]
    resources = ["*"]
  }
  # S3 access for backups
  statement {
    sid    = "BackupBucket"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:DeleteObject"
    ]
    resources = [
      "arn:aws:s3:::${var.backup_bucket_name}",
      "arn:aws:s3:::${var.backup_bucket_name}/*"
    ]
  }
  # KMS decrypt (for encrypted secrets + S3)
  statement {
    sid       = "KmsDecrypt"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key/*"]
  }
  # CloudWatch logs
  statement {
    sid       = "CloudWatchLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/dayjoy/n8n:*"]
  }
}

resource "aws_iam_role_policy" "n8n_host" {
  name   = "dayjoy-n8n-host-policy"
  role   = aws_iam_role.n8n_host.id
  policy = data.aws_iam_policy_document.secrets_access.json
}

resource "aws_iam_instance_profile" "n8n_host" {
  name = "dayjoy-n8n-host-profile"
  role = aws_iam_role.n8n_host.id
}

# CloudWatch log group for n8n host
resource "aws_cloudwatch_log_group" "n8n_host" {
  name              = "/dayjoy/n8n/host"
  retention_in_days = 30
}

# -----------------------------------------------------------------------------
# EC2 instance
# -----------------------------------------------------------------------------
resource "aws_instance" "n8n_host" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.private.ids[0]
  vpc_security_group_ids = [aws_security_group.n8n_host.id]
  iam_instance_profile   = aws_iam_instance_profile.n8n_host.name

  # 100 GB gp3 EBS for Docker images + n8n_data + Postgres data
  root_block_device {
    volume_type = "gp3"
    volume_size = 100
    iops        = 3000
    throughput  = 125
    encrypted   = true
    kms_key_id  = var.ebs_kms_key_id

    tags = {
      Name = "dayjoy-n8n-host-root"
    }
  }

  user_data_replace_on_change = true
  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    n8n_version        = var.n8n_version
    dayjoy_api_url     = var.dayjoy_api_url
    backup_bucket_name = var.backup_bucket_name
    aws_region         = var.aws_region
  }))

  tags = {
    Name = "dayjoy-n8n-host"
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [ami]
  }
}

# -----------------------------------------------------------------------------
# ALB + listeners + target group
# -----------------------------------------------------------------------------
resource "aws_lb" "n8n" {
  name               = "dayjoy-n8n-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.public.ids

  enable_deletion_protection = true
  enable_http2               = true

  access_logs {
    bucket  = var.alb_access_log_bucket
    prefix  = "n8n-alb"
    enabled = true
  }

  tags = {
    Name = "dayjoy-n8n-alb"
  }
}

resource "aws_lb_target_group" "n8n" {
  name        = "dayjoy-n8n-tg"
  port        = 443
  protocol    = "HTTPS"
  vpc_id      = data.aws_vpc.dayjoy.id
  target_type = "instance"
  slow_start  = 60

  health_check {
    enabled             = true
    path                = "/healthz"
    port                = "5678"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }
}

resource "aws_lb_target_group_attachment" "n8n" {
  target_group_arn = aws_lb_target_group.n8n.arn
  target_id        = aws_instance.n8n_host.id
  port             = 443
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.n8n.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.n8n.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.n8n.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# -----------------------------------------------------------------------------
# Cloudflare DNS record (proxied for DDoS protection)
# -----------------------------------------------------------------------------
resource "cloudflare_record" "n8n" {
  zone_id = var.cloudflare_zone_id
  name    = "n8n"
  value   = aws_lb.n8n.dns_name
  type    = "CNAME"
  proxied = true
  ttl     = 1 # auto when proxied

  comment = "Dayjoy n8n — managed by Terraform"
}

# -----------------------------------------------------------------------------
# CloudWatch alarms (basic host-level)
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "dayjoy-n8n-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "n8n host CPU > 80% for 10 min"
  alarm_actions       = [var.pagerduty_sns_topic_arn]
  ok_actions          = [var.pagerduty_sns_topic_arn]

  dimensions = {
    InstanceId = aws_instance.n8n_host.id
  }
}

resource "aws_cloudwatch_metric_alarm" "disk_high" {
  alarm_name          = "dayjoy-n8n-disk-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "disk_used_percent"
  namespace           = "CWAgent"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "n8n host disk usage > 80%"
  alarm_actions       = [var.pagerduty_sns_topic_arn]

  dimensions = {
    InstanceId = aws_instance.n8n_host.id
    path       = "/"
    fstype     = "ext4"
    device     = "nvme0n1p1"
  }
}
