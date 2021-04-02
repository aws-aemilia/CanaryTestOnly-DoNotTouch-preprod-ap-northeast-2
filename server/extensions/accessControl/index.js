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
    let pass = false;
    allowedUrlList.forEach((allowedUrl) => {
        if (apiUrl.startsWith(allowedUrl)) {
            pass = true;
        }
    });
    return pass;
};

module.exports = permissionChecker;
