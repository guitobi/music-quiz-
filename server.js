import 'dotenv/config';
import express from 'express'
import http from 'http'
import { Server } from "socket.io";
import SpotifyWebApi from  'spotify-web-api-node'
import spotifyPreviewFinder from 'spotify-preview-finder';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const SpotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});
const port = 3030;
 
app.use(express.static('public'));
app.use(express.json());

const rooms = {};

io.on('connection', socket => {
    console.log('User is connected');
    
    socket.on('message' , ({userNickname, roomCode, text}) => {
       io.to(roomCode).emit('message', {userNickname, text});
    });

    // socket.on('create-room', playerName => {
    //     const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    //     rooms[roomCode] = { gameIsStarted: false, players: {} };
    //     rooms[roomCode].players[socket.id] = { name: playerName };
    //     socket.room = roomCode;
    //     socket.join(roomCode);
    //     socket.emit('room-created', ({playerName , roomCode}));
    //     broadcastPlayersUpdate(roomCode);
    // });

    app.post('/api/rooms', (req, res) => {
        const playerName = req.body.playerName;
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomCode] = { gameIsStarted: false, players: {} };
        res.json({ roomCode: roomCode });
    });

    app.get('/api/rooms/:roomCode', (req, res) => {
        const roomCode = req.params.roomCode;
        if (rooms[roomCode]) {
            res.json({ exists: true });
        } else {
            res.status(404).json({ exists: false, message: 'Room not found' });
        }
    });

    socket.on('join-room', ({userNickname, roomCode}) => {
        console.log(`Гравець ${userNickname} приєднується до ${roomCode}`);
        console.log('До:', rooms[roomCode].players);

        socket.join(roomCode);
        rooms[roomCode].players[socket.id] = { name: userNickname, hasAnswered: false, score: 0 };
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
        rooms[roomCode].players[socket.id] = { name: nickname, hasAnswered: false, score: 0 };
        socket.room = roomCode;
        broadcastPlayersUpdate(roomCode);
    });

    socket.on('start-round', async (roomCode) => {
        try {
            Object.values(rooms[roomCode].players).forEach(player => player.hasAnswered = false);
            const question = await generateQuestion();
            rooms[roomCode].currentCorrectAnswer = question.artistName;
            io.to(roomCode).emit('new-round', question);

            const query = `${question.trackName} ${question.artistName}`;
            const previewResult = await spotifyPreviewFinder(query, 1);

            if (previewResult.success && previewResult.results.length > 0) {
                const previewUrl = previewResult.results[0].previewUrls[0];
                if (previewUrl) {
                    io.to(roomCode).emit('play-track', { url: previewUrl });
                }
            }
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('submit-button', ({ roomCode, nickname, answer }) => {
        if (!roomCode || !nickname || !answer) return;
        if (rooms[roomCode].players[socket.id].hasAnswered) return;
        const currentPlayer = rooms[roomCode].players[socket.id];
        const players = Object.values(rooms[roomCode].players);
        currentPlayer.hasAnswered = true;
        const resultRight = `${nickname} answered right`;
        const resultWrong = `${nickname} answered wrong`;
        if (answer === rooms[roomCode].currentCorrectAnswer) {
            rooms[roomCode].players[socket.id].score += 10;
            io.to(roomCode).emit('submit-result', resultRight);
        } else {
            io.to(roomCode).emit('submit-result', resultWrong);
        }
        const allAnswered = players.every(player => player.hasAnswered);
        if (allAnswered) {
            io.to(roomCode).emit('round-over');
        }
    });

});

const getNames = (players) => Object.values(players);

const broadcastPlayersUpdate = (roomCode) => {
    io.to(roomCode).emit('players-update', getNames(rooms[roomCode].players));
};

const generateQuestion = async () => {
    try {
        const playlist = await SpotifyApi.getPlaylist(process.env.SPOTIFY_PLAYLIST_ID);
        const tracks = playlist.body.tracks.items.map(item => ({
            name: item.track.name,
            artist: item.track.artists[0].name,
         }));

        const tracksByArtist = new Map();
        for (const track of tracks) {
            if (!tracksByArtist.has(track.artist)) {
                tracksByArtist.set(track.artist, track);
            }
        }
        const uniqueTracks = Array.from(tracksByArtist.values());

        if (uniqueTracks.length < 4) {
            throw new Error('У вашому плейлисті недостатньо унікальних виконавців (потрібно мінімум 4)');
        }

        const fourTracks = shuffle(uniqueTracks).slice(0, 4);
        const correctTrack = fourTracks[0];
        const options = shuffle(fourTracks.map(t => t.artist));

        return {
            trackName: correctTrack.name,
            artistName: correctTrack.artist,
            options: options,
        };
    } catch (err) {
        console.error(err);
    }
    
};

// допоміжна хуйня для перемішування
const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    };
    return arr;
};

const initializeSpotify = async () => {
    try {
        const cleintCrd = await SpotifyApi.clientCredentialsGrant();
        const accessToken = cleintCrd.body.access_token;
        SpotifyApi.setAccessToken(accessToken);
        console.log('Токен поновлено');
    } catch (err) {
        console.error(`Не вдалось дістати токен, ${err}`)
    }
    
};

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
