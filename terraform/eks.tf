# NOTE: This is a simplified example. For production, it's highly recommended
# to use the official Terraform EKS module, which handles VPCs, IAM roles,
# and node groups more robustly.
#
# This assumes you have a VPC and subnets already defined (e.g., in vpc.tf)
# and an IAM role for the EKS cluster.

resource "aws_eks_cluster" "bread_sheet_cluster" {
  name     = "bread-sheet-cluster"
  role_arn = aws_iam_role.eks_cluster_role.arn # Assumes this role is defined elsewhere

  vpc_config {
    subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id] # Assumes subnets are defined
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
  ]
}

resource "aws_eks_node_group" "bread_sheet_nodes" {
  cluster_name    = aws_eks_cluster.bread_sheet_cluster.name
  node_group_name = "bread-sheet-default-nodes"
  node_role_arn   = aws_iam_role.eks_node_role.arn # Assumes this role is defined elsewhere
  subnet_ids      = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  instance_types = ["t3.medium"]

  scaling_config {
    desired_size = 2
    max_size     = 3
    min_size     = 1
  }

  update_config {
    max_unavailable = 1
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
    aws_iam_role_policy_attachment.ecr_read_only_policy,
  ]
}