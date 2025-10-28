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
    socket.on('message' , ({roomCode, text}) => {
       io.to(roomCode).emit('message', text);
    });
    socket.on('create-room', playerName => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        socket.join(roomCode);
        socket.emit('room-created', roomCode);
    });
    socket.on('join-room', ({name, roomCode}) => {
        socket.join(roomCode);
        socket.emit('room-joined', roomCode);
    });
});


server.listen(port, () => {
    console.log(`Server started on port ${port}`)
});