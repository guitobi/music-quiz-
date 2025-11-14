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
        socket.join(roomCode);

        if (!rooms[roomCode] || rooms[roomCode].gameIsStarted || rooms[roomCode].isLobbyLocked) {
            socket.emit('error-game-in-progress')
            return;
        }

        if (!rooms[roomCode].disconnectedPlayers)
            rooms[roomCode].disconnectedPlayers = [];

        if (Object.values(rooms[roomCode].players).some(p => p.name === userNickname)) {
            socket.emit('error-nickname-taken');
            return;
        }

        const index = rooms[roomCode].disconnectedPlayers.findIndex(p => p.name === userNickname);

        let score;
        let isHost;

        if (index !== -1) { 
            score = rooms[roomCode].disconnectedPlayers[index].score;
            isHost = rooms[roomCode].disconnectedPlayers[index].isHost;
            rooms[roomCode].disconnectedPlayers.splice(index, 1);
        } else { 
            score = 0;
            isHost = Object.keys(rooms[roomCode].players).length === 0;
        }

        rooms[roomCode].players[socket.id] = { name: userNickname, score, isHost };
        socket.room = roomCode;

        if (rooms[roomCode].gameIsStarted) {
            socket.emit('game-started', { userNickname: userNickname, roomCode: roomCode })
        } else {
            socket.emit('room-joined', {
            userNickname: userNickname,
            roomCode,
            Host: isHost
        });
        }
        
        broadcastPlayersUpdate(roomCode);
    });

    socket.on('rejoin-room', ({ userNickname, roomCode }) => {
        socket.join(roomCode);
        if (!rooms[roomCode]) return;
        if (!rooms[roomCode].disconnectedPlayers)
            rooms[roomCode].disconnectedPlayers = [];

        // if (Object.values(rooms[roomCode].players).some(p => p.name === userNickname)) {
        //     socket.emit('error-nickname-taken');
        //     return;
        // }

        const index = rooms[roomCode].disconnectedPlayers.findIndex(p => p.name === userNickname);

        let score;
        let isHost;

        if (index !== -1) { 
            score = rooms[roomCode].disconnectedPlayers[index].score;
            isHost = rooms[roomCode].disconnectedPlayers[index].isHost;
            rooms[roomCode].disconnectedPlayers.splice(index, 1);
        } else { 
            score = 0;
            isHost = Object.keys(rooms[roomCode].players).length === 0;
        }

        rooms[roomCode].players[socket.id] = { name: userNickname, score, isHost };
        socket.room = roomCode;

        if (isHost && rooms[roomCode].hostPromotionTimer)  clearTimeout(rooms[roomCode].hostPromotionTimer);

        if (rooms[roomCode].gameIsStarted) io.to(socket.id).emit('sync-game-state', {currentRound: rooms[roomCode].currentRound, totalRounds: rooms[roomCode].totalRounds, curQuestion: rooms[roomCode].currentQuestion});

        socket.emit('room-joined', {
            userNickname: userNickname,
            roomCode,
            Host: isHost
        });

        broadcastPlayersUpdate(roomCode);
    });

    socket.on('disconnect', () => {
        if (!rooms[socket.room] || !rooms[socket.room].players[socket.id]) return;
        if (!rooms[socket.room]) return;
        if (!rooms[socket.room].disconnectedPlayers) {
            rooms[socket.room].disconnectedPlayers = [];
        }
        rooms[socket.room].disconnectedPlayers.push({ ...rooms[socket.room].players[socket.id] });

        const wasHost = rooms[socket.room].players[socket.id].isHost;
        
        delete rooms[socket.room].players[socket.id];

        rooms[socket.room].hostPromotionTimer = setTimeout(() => {
            const newHostSocketId = Object.keys(rooms[socket.room].players)[0];
            if (wasHost && newHostSocketId) {
                rooms[socket.room].players[newHostSocketId].isHost = true;
                io.to(newHostSocketId).emit('new-host');
            }
        }, 5000);
        
        broadcastPlayersUpdate(socket.room);

        if (!rooms[socket.room].gameIsStarted && Object.keys(rooms[socket.room].players).length === 0) delete rooms[socket.room];
    });

    socket.on('start-game', ({roomCode}) => {
        const player = rooms[roomCode].players[socket.id];
        if (!player.isHost) return;
        if (!rooms[roomCode].disconnectedPlayers) {
            rooms[roomCode].disconnectedPlayers = [];
        }
        Object.values(rooms[roomCode].players).forEach((player) => {
            rooms[roomCode].disconnectedPlayers.push(player);
        });
        rooms[roomCode].players = {}
        rooms[roomCode].isLobbyLocked = true;
        io.to(roomCode).emit('game-started', { roomCode: roomCode} );
        // startNewGame(roomCode, socket);
    });

    socket.on('start-round', async (roomCode) => {
        await startNewGame(roomCode, socket);
    });

    socket.on('submit-button', ({ roomCode, nickname, answer }) => {
        if (!roomCode || !nickname || !answer) return;
        if (rooms[roomCode].roundResults[socket.id]) return;

        const currentPlayer = rooms[roomCode].players[socket.id];
        const players = rooms[roomCode].players;
        
        const isCorrect = answer === rooms[roomCode].currentCorrectAnswer;
        if (isCorrect) rooms[roomCode].players[socket.id].score += 10;
        rooms[roomCode].roundResults[socket.id] = { hasAnswered: true, isCorrectAnswer: isCorrect };
           
        // const allAnswered = Object.values(rooms[roomCode].roundResults[socket.id]).every(player => player.hasAnswered);
        if (Object.keys(rooms[roomCode].roundResults).length === Object.keys(rooms[roomCode].players).length) {
            if (rooms[roomCode].roundOverSent) return;
            rooms[roomCode].roundOverSent = true;
            const results = Object.keys(players).map(player => {
                return {
                    name: players[player].name,
                    score: players[player].score,
                    isCorrectAnswer: rooms[roomCode].roundResults[player].isCorrectAnswer
                }
            });
            broadcastPlayersUpdate(roomCode);
            io.to(roomCode).emit('round-over', { results: results });
        }
    });

    socket.on('play-again', async ({ roomCode }) => { 
        const player = rooms[roomCode].players[socket.id];
        if (!player.isHost) return;
        if (!rooms[roomCode].disconnectedPlayers) {
            rooms[roomCode].disconnectedPlayers = [];
        }
        Object.values(rooms[roomCode].players).forEach((player) => {
            rooms[roomCode].disconnectedPlayers.push(player);
        });
        rooms[roomCode].players = {}
        rooms[roomCode].isLobbyLocked = true;
        io.to(roomCode).emit('game-started', { roomCode: roomCode} );
        // await startNewGame(roomCode, socket);
    });

    socket.on('next-round', async (roomCode) => {
        await startNewRound(roomCode);
    })

});

const startNewRound = async (roomCode) => {
    try {
            rooms[roomCode].currentRound++;
            if (rooms[roomCode].currentRound > rooms[roomCode].totalRounds) {
                rooms[roomCode].gameIsStarted = false;
                rooms[roomCode].isLobbyLocked = false;
                const sortedPlayers = Object.values(rooms[roomCode].players).sort((a, b) => b.score - a.score);
                io.to(roomCode).emit('game-over', { finalScores: sortedPlayers });
            } else {
                const question = await generateQuestion();
                
                // ПЕРЕВІРКА якщо питання не згенерувалось
                if (!question) {
                    io.to(roomCode).emit('error-message', 'Не вдалось завантажити питання. Спробуйте інший плейлист.');
                    console.error(`Не вдалось згенерувати питання для кімнати ${roomCode}`);
                    return;
                }
                const query = `${question.trackName} ${question.artistName}`;
                const previewResult = await spotifyPreviewFinder(query, 1);
                rooms[roomCode].currentCorrectAnswer = question.artistName;
                rooms[roomCode].currentQuestion = question;

                if (previewResult.success && previewResult.results.length > 0) {
                    const previewUrl = previewResult.results[0].previewUrls[0];
                    if (previewUrl) {
                        io.to(roomCode).emit('new-round', {
                            question: question,
                            currentRound: rooms[roomCode].currentRound,
                            totalRounds: rooms[roomCode].totalRounds,
                            url: previewUrl
                        });
                    }
                }
                
                rooms[roomCode].roundOverSent = false;
                rooms[roomCode].roundResults = {};

                if (rooms[roomCode].currentTimer) clearTimeout(rooms[roomCode].currentTimer);

                rooms[roomCode].currentTimer = setTimeout(() => { 
                    if (rooms[roomCode].roundOverSent) return;
                    rooms[roomCode].roundOverSent = true;
                    const players = rooms[roomCode].players;
                    const results = rooms[roomCode].roundResults;
                    const infoToSend = Object.keys(players).map(player => {
                        return {
                            name: players[player].name,
                            score: players[player].score,
                            isCorrectAnswer: results[player] ? results[player].isCorrectAnswer : false
                        }
                    });
                    io.to(roomCode).emit('round-over', { results: infoToSend });
                }, 15000); 
            }
        } catch (err) {
            console.error('Критична помилка в start-round:', err);
            io.to(roomCode).emit('error-message', 'Сталась помилка. Перезапустіть гру.');
        }
};

const startNewGame = async (roomCode, socket) => {
    const player = rooms[roomCode].players[socket.id];

    if (!player || !player.isHost) return;

    rooms[roomCode].gameIsStarted = true;
    rooms[roomCode].currentRound = 0;
    rooms[roomCode].totalRounds = 5;
    Object.values(rooms[roomCode].players).forEach(player => player.score = 0);
    broadcastPlayersUpdate(roomCode);

    if (rooms[roomCode].currentTimer) clearTimeout(rooms[roomCode].currentTimer);

    await startNewRound(roomCode);
}

const getNames = (players) => Object.values(players);

const broadcastPlayersUpdate = (roomCode) => {
    io.to(roomCode).emit('players-update', getNames(rooms[roomCode].players));
};

const generateQuestion = async () => {
    try {
        const playlist = await SpotifyApi.getPlaylist(process.env.SPOTIFY_PLAYLIST_ID);
        
        if (!playlist.body || !playlist.body.tracks || !playlist.body.tracks.items) {
            throw new Error('Плейлист порожній або має неправильну структуру');
        }

        const tracks = playlist.body.tracks.items
            .filter(item => {
                if (!item || !item.track) return false;
                if (!item.track.name) return false;
                if (!item.track.artists || item.track.artists.length === 0) return false;
                if (!item.track.artists[0].name) return false;
                
                return true;
            })
            .map(item => ({
                name: item.track.name,
                artist: item.track.artists[0].name,
            }));

        console.log(`Знайдено ${tracks.length} валідних треків у плейлисті`);

        if (tracks.length === 0) {
            throw new Error('У плейлисті немає валідних треків');
        }

        const tracksByArtist = new Map();
        for (const track of tracks) {
            if (!tracksByArtist.has(track.artist)) {
                tracksByArtist.set(track.artist, track);
            }
        }
        const uniqueTracks = Array.from(tracksByArtist.values());

        console.log(`Знайдено ${uniqueTracks.length} унікальних виконавців`);

        if (uniqueTracks.length < 4) {
            throw new Error(`У плейлисті недостатньо унікальних виконавців (потрібно мінімум 4, знайдено ${uniqueTracks.length})`);
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
        console.error('Помилка генерації питання:', err.message);
        return null;
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
