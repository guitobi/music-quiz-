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

const rooms = {};

io.on('connection', socket => {
    console.log('User is connected');
    socket.on('message' , ({roomCode, text}) => {
       io.to(roomCode).emit('message', text);
    });
    socket.on('create-room', playerName => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomCode] = {};
        rooms[roomCode][socket.id] = { name: playerName };
        socket.join(roomCode);
        socket.emit('room-created', ({playerName , roomCode}));
        io.to(roomCode).emit('players-update', getNames(rooms[roomCode]));
    });
    socket.on('join-room', ({userNickname, roomCode}) => {
        console.log(`Гравець ${userNickname} приєднується до ${roomCode}`);
        console.log('До:', rooms[roomCode]);

        socket.join(roomCode);
        rooms[roomCode][socket.id] = { name: userNickname };

        console.log('Після:', rooms[roomCode]);

        socket.emit('room-joined', ({userNickname, roomCode}));
        io.to(roomCode).emit('players-update', getNames(rooms[roomCode]));
    });
});

const getNames = (rooms) => {
    const namesObj = Object.values(rooms);
    const namesArr = namesObj.map(name =>  name.name );
    return namesArr;
};

server.listen(port, () => {
    console.log(`Server started on port ${port}`)
});