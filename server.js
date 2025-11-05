import 'dotenv/config';
import express from 'express'
import http from 'http'
import { Server } from "socket.io";
import SpotifyWebApi from  'spotify-web-api-node'

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const SpotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});
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

    socket.on('start-round', async (roomCode) => {
        try {
            const question = await generateQuestion();
            rooms[roomCode].currentCorrectAnswer = question.artistName;
            io.to(roomCode).emit('new-round', question);    
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('submit-button', ({ roomCode, nickname, answer}) => {
        if (!roomCode || !nickname || !answer) return;
        const resultRight = `${nickname} answer right`;
        const resultWrong = `${nickname} answer wrong`;
        if (answer === rooms[roomCode].currentCorrectAnswer) {
            io.to(roomCode).emit('submit-result', resultRight);
            io.to(roomCode).emit('round-over');
        } else {
            io.to(roomCode).emit('submit-result', resultWrong);
            io.to(roomCode).emit('round-over');
        }
    });
});

const getNames = (rooms) => {
    const namesObj = Object.values(rooms);
    const namesArr = namesObj.map(name =>  name.name );
    return namesArr;
};

const broadcastPlayersUpdate = (roomCode) => {
    io.to(roomCode).emit('players-update', getNames(rooms[roomCode].players));
};

const generateQuestion = async () => {
    const playlist = await SpotifyApi.getPlaylist('5ieJqeLJjjI8iJWaxeBLuK');
    const tracks = playlist.body.tracks.items.map(item => ({ name: item.track.name, artist: item.track.artists[0].name }));  //масив об'єктів з назвою пісні і виконавцем
    const fourTracks = [];
    if (tracks.length < 4) throw new Error('Недостатньо треків у плейлисті');

    while (fourTracks.length < 4) {
        const randomIndex = Math.floor(Math.random() * tracks.length);
        if (fourTracks.includes(tracks[randomIndex])) {
            continue;
        } else {
            fourTracks.push(tracks[randomIndex]);
        }
    };

    const correctTrack = fourTracks[0]; // об'єкт з аристом і треком
    const options = shuffle(fourTracks.map(i => i.artist)); // перемішка
    return {
        trackName: correctTrack.name,
        artistName: correctTrack.artist,
        options: options
    }
};

// допоміжна хуйня для перемішування
const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const initializeSpotify = async () => {
    const cleintCrd = await SpotifyApi.clientCredentialsGrant();
    const accessToken = cleintCrd.body.access_token;
    SpotifyApi.setAccessToken(accessToken);
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

const startServer = async () => {
    await initializeSpotify();
    setInterval(initializeSpotify, 3300000);
    server.listen(port, () => {
    console.log(`Server started on port ${port}`)
});
};


startServer();


