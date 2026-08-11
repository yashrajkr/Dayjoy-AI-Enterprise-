# Terraform — Production Environment
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws"; version = "~> 5.0" }
  }
  backend "s3" {
    bucket         = "dayjoyai-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "dayjoyai-tf-locks"
  }
}

provider "aws" {
  region = "ap-south-1"
}

locals {
  cluster_name = "dayjoyai-production"
  environment  = "production"
}

# --- Shared encryption key ---------------------------------------------------
module "kms" {
  source = "../../modules/kms"
}

# --- Network + compute -------------------------------------------------------
module "vpc" {
  source        = "../../modules/vpc"
  vpc_cidr      = "10.0.0.0/16"
  environment   = local.environment
  cluster_name  = local.cluster_name
  region        = "ap-south-1"
}

module "eks" {
  source            = "../../modules/eks"
  cluster_name      = local.cluster_name
  environment       = local.environment
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.private_subnet_ids
  node_min          = 3
  node_max          = 10
  node_desired      = 4
  node_instance_type = "t3.xlarge"
}

# --- Data plane (RDS + Redis) ------------------------------------------------
module "rds" {
  source                       = "../../modules/rds"
  cluster_name                 = local.cluster_name
  environment                  = local.environment
  vpc_id                       = module.vpc.vpc_id
  subnet_ids                   = module.vpc.private_subnet_ids
  db_username                  = "dayjoy"
  db_password                  = var.db_password
  db_name                      = "dayjoyai"
  instance_class               = "db.r6g.large"
  allocated_storage            = 100
  multi_az                     = true
  backup_retention_days        = 7
  kms_key_id                   = module.kms.kms_key_id
  eks_node_security_group_id   = module.eks.eks_node_security_group_id
}

module "redis" {
  source                       = "../../modules/elasticache"
  cluster_name                 = local.cluster_name
  environment                  = local.environment
  vpc_id                       = module.vpc.vpc_id
  subnet_ids                   = module.vpc.private_subnet_ids
  node_type                    = "cache.r6g.large"
  kms_key_id                   = module.kms.kms_key_id
  eks_node_security_group_id   = module.eks.eks_node_security_group_id
}

# --- Object storage (encrypted backups) -------------------------------------
module "backups" {
  source      = "../../modules/s3"
  environment = local.environment
  kms_key_id  = module.kms.kms_key_id
}

# --- Edge protection ---------------------------------------------------------
module "waf" {
  source = "../../modules/waf"
}

# --- DNS + TLS ---------------------------------------------------------------
module "dns" {
  source       = "../../modules/dns"
  domain_name  = "dayjoy.ai"
  zone_id      = var.zone_id
  alb_dns_name = var.alb_dns_name
  alb_zone_id  = var.alb_zone_id
}

# --- Secrets Manager (consumed by ExternalSecrets in cluster) ---------------
# TODO: Create secrets module or use Kubernetes ExternalSecrets Operator.
# The `modules/secrets/` directory does not exist in this repo, so this
# block is commented out to keep `terraform plan` parseable. When a secrets
# module is added (AWS Secrets Manager secrets for `dayjoy/prod/*` paths),
# uncomment this block and the `secret_arns` output below.
# module "secrets" {
#   source      = "../../modules/secrets"
#   environment = "prod"
#   kms_key_id  = module.kms.kms_key_id
# }

# --- Inputs ------------------------------------------------------------------
variable "db_password" {
  type      = string
  sensitive = true
}

variable "zone_id" {
  type        = string
  description = "Route53 hosted zone ID for dayjoy.ai"
}

variable "alb_dns_name" {
  type        = string
  description = "ALB DNS name to alias the apex domain to"
}

variable "alb_zone_id" {
  type        = string
  description = "Route53 zone ID of the ALB"
}

# --- Outputs -----------------------------------------------------------------
output "cluster_endpoint" { value = module.eks.cluster_endpoint }
output "db_endpoint" { value = module.rds.db_endpoint }
output "redis_endpoint" { value = module.redis.redis_endpoint }
output "backup_bucket" { value = module.backups.bucket_name }
output "kms_key_arn" { value = module.kms.kms_key_arn }
output "waf_arn" { value = module.waf.waf_arn }
output "certificate_arn" { value = module.dns.certificate_arn }
# output "secret_arns" { value = module.secrets.secret_arns }  # TODO: re-enable when modules/secrets/ exists (see note above)
