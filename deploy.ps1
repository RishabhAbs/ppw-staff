$ErrorActionPreference = "Stop"

$versionLabel = "ppw-login-swfix-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$bucket = "elasticbeanstalk-ap-south-1-374894298556"
$zipPath = "d:\ppw-staff\ppw_deploy_latest.zip"
$s3Key = "ppw_deploy_latest_$versionLabel.zip"

Write-Host "1. Uploading bundle to S3 ($s3Key)..."
aws s3 cp $zipPath "s3://$bucket/$s3Key" --profile default --region ap-south-1

Write-Host "2. Creating Elastic Beanstalk Application Version..."
aws elasticbeanstalk create-application-version `
    --application-name ppw `
    --version-label $versionLabel `
    --source-bundle S3Bucket=$bucket,S3Key=$s3Key `
    --profile default `
    --region ap-south-1 | Out-Null

Write-Host "3. Triggering Environment Update (This will restart the live server)..."
aws elasticbeanstalk update-environment `
    --environment-name Ppw-env `
    --version-label $versionLabel `
    --profile default `
    --region ap-south-1 | Out-Null

Write-Host "Deployment triggered successfully! The live server will be updated in ~2 minutes."
