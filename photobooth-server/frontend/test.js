const { io } = require("socket.io-client");
const socket = io("https://kmeng.ftp.sh/hellomyphotos-photobooth-test", { path: "/socket.io" });
console.log(socket.io.uri);
console.log(socket.io.opts.path);
