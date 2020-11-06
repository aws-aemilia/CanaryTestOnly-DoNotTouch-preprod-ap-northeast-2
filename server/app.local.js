process.env.NODE_ENV = "development";
const app = require("./main.js");
const port = 3000;

app.listen(port);
console.log(`listening on http://localhost:${port}`);