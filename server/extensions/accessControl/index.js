const allowedUrlList = [
    "/username",
    "/permission",
    "/regions",
    "/api/builds",
    "/api/logs",
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