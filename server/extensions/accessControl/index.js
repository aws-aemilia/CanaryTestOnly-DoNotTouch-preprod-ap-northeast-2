const allowedUrlList = [
    "/username",
    "/regions",
    "/api/builds",
    "/api/metrics/builds/failed",
    "/customerinfoApp",
    "/customerinfoBranch",
    "/customerinfoJob",
    "/customerinfoJobMore",
    "/customerinfoDomain",
    "/customerinfoWebhook",
    "/customerinfoLambdaEdgeConfig",
];
const permissionChecker = (apiUrl) => {
    allowedUrlList.forEach((allowedUrl) => {
        if (apiUrl.startsWith(allowedUrl)) {
            return true;
        }
    });
    return false;
};

module.exports = permissionChecker;
