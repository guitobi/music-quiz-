import 'dotenv/config';
import express from 'express'
import http from 'http'
import { Server } from "socket.io";
import { brotliDecompress } from 'zlib';
// import { SpotifyApi } from '@spotify/web-api-ts-sdk';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3030;

app.use(express.static('public'))

const rooms = {};

io.on('connection', socket => {
    console.log('User is connected');
    
    socket.on('message' , ({userNickname, roomCode, text}) => {
       io.to(roomCode).emit('message', {userNickname, text});
    });

    socket.on('create-room', playerName => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomCode] = { gameIsStarted: false, players: {} };
        rooms[roomCode].players[socket.id] = { name: playerName };
        socket.room = roomCode;
        socket.join(roomCode);
        socket.emit('room-created', ({playerName , roomCode}));
        broadcastPlayersUpdate(roomCode);
    });

    socket.on('join-room', ({userNickname, roomCode}) => {
        console.log(`Гравець ${userNickname} приєднується до ${roomCode}`);
        console.log('До:', rooms[roomCode].players);

        socket.join(roomCode);
        rooms[roomCode].players[socket.id] = { name: userNickname };
        socket.room = roomCode;

        console.log('Після:', rooms[roomCode].players);

        socket.emit('room-joined', ({userNickname, roomCode}));
        broadcastPlayersUpdate(roomCode);
    });

    socket.on('disconnect', () => {
        if (!rooms[socket.room] || !rooms[socket.room].players[socket.id]) return;

        delete rooms[socket.room].players[socket.id];
        broadcastPlayersUpdate(socket.room);

        if (!rooms[socket.room].gameIsStarted && Object.keys(rooms[socket.room].players).length === 0) delete rooms[socket.room];
    });

    socket.on('start-game', ({roomCode}) => {
        rooms[roomCode].gameIsStarted = true;
        io.to(roomCode).emit('game-started');
    })
    
    socket.on('rejoin-room', ({roomCode, nickname}) => {
        socket.join(roomCode);
        if (rooms[roomCode].players) {
            for (const [id, player] of Object.entries(rooms[roomCode].players)) {
                if (player.name === nickname) delete rooms[roomCode].players[id];
            }
        }
        rooms[roomCode].players[socket.id] = { name: nickname };
        socket.room = roomCode;
        broadcastPlayersUpdate(roomCode);
    });
});

const getNames = (rooms) => {
    const namesObj = Object.values(rooms);
    const namesArr = namesObj.map(name =>  name.name );
    return namesArr;
};

const broadcastPlayersUpdate = (roomCode) => {
    io.to(roomCode).emit('players-update', getNames(rooms[roomCode].players));
}

// app.get('/api/rooms', (req, res) => {
//     const roomsAndPlayers = Object.keys(rooms).map(room => {
//         return { roomCode: room, playerCount: Object.values(rooms[room]).length };
//     });

//     res.json({
//         status: 'success',
//         data: {
//             rooms: {
//                 roomsAndPlayers: roomsAndPlayers
//             }
//         }
//     });
// });


server.listen(port, () => {
    console.log(`Server started on port ${port}`)
});