eval "$(aws ecr get-login --no-include-email --region eu-west-1 | sed 's|https://||')"

# check if ECR already has some images, if so we don't need to push a dummy image
# using python rather than jq lib to parse json as jq not installed on macOS by default, but python is used by aws cli so definitely available everywhere
export PYTHONIOENCODING=utf8
hasImage=$(aws ecr list-images --repository-name ${ENV}pubsub | \
    python2 -c "import sys, json; print len(json.load(sys.stdin)['imageIds'])")

if [ "$hasImage" -eq 0 ]; then
  echo 'ECR empty: pushing dummy image'
  docker build -t ${ACCOUNTID}.dkr.ecr.eu-west-1.amazonaws.com/${ENV}pubsub:latest docker/dummy
  docker push ${ACCOUNTID}.dkr.ecr.eu-west-1.amazonaws.com/${ENV}pubsub:latest
else
  echo 'ECR contains images: do not push dummy image'
fi
