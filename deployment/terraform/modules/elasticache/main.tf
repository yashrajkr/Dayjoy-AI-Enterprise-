# Terraform — ElastiCache Redis Module
variable "cluster_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "node_type" { type = string; default = "cache.t3.micro" }
variable "kms_key_id" { type = string; default = null }
variable "eks_node_security_group_id" { type = string; default = null }

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.cluster_name}-redis-subnet-group"
  subnet_ids = var.subnet_ids
}

# Redis ingress restricted to EKS worker nodes only (Phase 1 fix).
resource "aws_security_group" "redis" {
  name        = "${var.cluster_name}-redis-sg"
  description = "Allow Redis from EKS nodes only"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = var.eks_node_security_group_id != null ? [1] : []
    content {
      from_port       = 6379
      to_port         = 6379
      protocol        = "tcp"
      security_groups = [var.eks_node_security_group_id]
    }
  }

  egress { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.cluster_name}-redis"
  description                = "Redis for ${var.cluster_name}"
  node_type                  = var.node_type
  number_cache_clusters      = var.environment == "production" ? 2 : 1
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  automatic_failover_enabled = var.environment == "production"
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false
  kms_key_id                 = var.kms_key_id
  tags = { Name = var.cluster_name, Environment = var.environment }
}

output "redis_endpoint" { value = aws_elasticache_replication_group.main.primary_endpoint_address }
