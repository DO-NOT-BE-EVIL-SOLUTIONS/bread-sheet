# ──────────── VPC Link Security Group ─────────────────────────────────────────────
resource "aws_security_group" "vpclink" {
  name        = "BreadSheet DEV SG VPC Link"
  description = "ENIs API Gateway places in the VPC to reach the Fargate tasks"
  vpc_id      = aws_vpc.main.id

  # No ingress, and no inline egress — see the rule below. TLS terminates at
  # API Gateway outside the VPC; these ENIs only originate traffic to the task.

  tags = merge(local.tags, {
    Name     = "breadsheet-dev-sg-vpclink"
    Resource = "APIGateway"
  })
}

resource "aws_vpc_security_group_ingress_rule" "task_from_vpclink" {
  security_group_id            = aws_security_group.task.id
  referenced_security_group_id = aws_security_group.vpclink.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "vpclink_to_task" {
  security_group_id            = aws_security_group.vpclink.id
  referenced_security_group_id = aws_security_group.task.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}

# ──────────── Task Security Group ─────────────────────────────────────────────

# No inline rules on this group. A security group with in-line ingress/egress
# blocks treats itself as authoritative over that group's whole rule set, so
# mixing it with the standalone *_rule resources above makes the two fight:
# the group revokes what it does not know about, the rule resource re-adds it,
# and the diff never settles.
resource "aws_security_group" "task" {
  name        = "BreadSheet DEV SG Tasks"
  description = "Security Group for task ressources - necessary to respond to requests, e.g., Fargate"
  vpc_id      = aws_vpc.main.id

  tags = merge(local.tags, {
    Name     = "breadsheet-dev-sg-tasks"
    Resource = "Fargate"
  })
}

# Unrestricted egress: the task pulls its image from GHCR and reaches Supabase,
# Google (WIF/Vertex) and SSM through the internet gateway.
# `ip_protocol = "-1"` means every protocol, and from_port/to_port must be
# omitted with it — setting them is an error rather than a no-op.
resource "aws_vpc_security_group_egress_rule" "task_all_ipv4" {
  security_group_id = aws_security_group.task.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "task_all_ipv6" {
  security_group_id = aws_security_group.task.id
  cidr_ipv6         = "::/0"
  ip_protocol       = "-1"
}

# ──────────── RDS Security Group ──────────────────────────────────────────────

resource "aws_security_group" "rds" {
  name        = "BreadSheet DEV SG Database"
  description = "Strict Security Group for connection to the databases"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.task.id]
  }

  tags = merge(local.tags, {
    Name     = "breadsheet-dev-sg-execution"
    Resource = "database"
  })
}