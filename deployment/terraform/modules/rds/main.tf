# Terraform — RDS PostgreSQL Module
variable "cluster_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "db_username" { type = string }
variable "db_password" { type = string }
variable "db_name" { type = string }
variable "instance_class" { type = string; default = "db.t3.medium" }
variable "allocated_storage" { type = number; default = 50 }
variable "multi_az" { type = bool; default = false }
variable "backup_retention_days" { type = number; default = 7 }
variable "kms_key_id" { type = string; default = null }
variable "eks_node_security_group_id" { type = string; default = null }

resource "aws_db_subnet_group" "main" {
  name       = "${var.cluster_name}-db-subnet-group"
  subnet_ids = var.subnet_ids
}

# Security group restricts PostgreSQL ingress to EKS worker nodes only.
# 0.0.0.0/0 ingress was removed in Phase 1 (RDS-open-to-internet fix).
resource "aws_security_group" "rds" {
  name        = "${var.cluster_name}-rds-sg"
  description = "Allow PostgreSQL from EKS nodes only"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = var.eks_node_security_group_id != null ? [1] : []
    content {
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [var.eks_node_security_group_id]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "main" {
  identifier             = "${var.cluster_name}-postgres"
  engine                 = "postgres"
  engine_version         = "16.3"
  instance_class         = var.instance_class
  allocated_storage      = var.allocated_storage
  storage_type           = "gp3"
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az               = var.multi_az
  backup_retention_period = var.backup_retention_days
  storage_encrypted      = true
  kms_key_id             = var.kms_key_id
  deletion_protection    = var.environment == "production"
  skip_final_snapshot    = var.environment != "production"
  tags = { Name = var.cluster_name, Environment = var.environment }
}

output "db_endpoint" { value = aws_db_instance.main.endpoint }
output "db_arn" { value = aws_db_instance.main.arn }
