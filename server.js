import 'dotenv/config';
import express from 'express'
import http from 'http'
import { Server } from "socket.io";
// import { SpotifyApi } from '@spotify/web-api-ts-sdk';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3030;

app.use(express.static('public'))

io.on('connection', socket => {
    console.log('User is connected');
    socket.on('message' , (data) => {
        socket.broadcast.emit('message', data);
    })
});

server.listen(port, () => {
    console.log(`Server started on port ${port}`)
});