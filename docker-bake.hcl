variable "IMAGE_REPO" {
  default = "pantry"
}

variable "TAG" {
  default = "dev"
}

group "default" {
  targets = ["api", "web"]
}

target "_common" {
  context    = "."
  dockerfile = "Dockerfile"
  platforms = ["linux/amd64"]
}

target "api" {
  inherits = ["_common"]
  target   = "api"
  tags     = ["${IMAGE_REPO}-api:${TAG}"]
}

target "web" {
  inherits = ["_common"]
  target   = "web"
  tags     = ["${IMAGE_REPO}-web:${TAG}"]
}
