# Terraform — VPC Module
variable "vpc_cidr" { type = string }
variable "environment" { type = string }
variable "cluster_name" { type = string }
variable "region" { type = string }

resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr
  enable_dns_support = true
  enable_dns_hostnames = true
  tags = { Name = "${var.cluster_name}-vpc", Environment = var.environment }
}

resource "aws_subnet" "public" {
  count = 3
  vpc_id = aws_vpc.main.id
  cidr_block = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "${var.cluster_name}-pub-${count.index+1}", "kubernetes.io/role/elb" = "1", "kubernetes.io/cluster/${var.cluster_name}" = "shared" }
}

resource "aws_subnet" "private" {
  count = 3
  vpc_id = aws_vpc.main.id
  cidr_block = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "${var.cluster_name}-priv-${count.index+1}", "kubernetes.io/role/internal-elb" = "1", "kubernetes.io/cluster/${var.cluster_name}" = "shared" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_eip" "nat" { count = 1; domain = "vpc" }

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat[0].id
  subnet_id = aws_subnet.public[0].id
  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0"; gateway_id = aws_internet_gateway.main.id }
}

resource "aws_route_table_association" "public" {
  count = 3; subnet_id = aws_subnet.public[count.index].id; route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0"; nat_gateway_id = aws_nat_gateway.main.id }
}

resource "aws_route_table_association" "private" {
  count = 3; subnet_id = aws_subnet.private[count.index].id; route_table_id = aws_route_table.private.id
}

data "aws_availability_zones" "available" { state = "available" }

output "vpc_id" { value = aws_vpc.main.id }
output "public_subnet_ids" { value = aws_subnet.public[*].id }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
