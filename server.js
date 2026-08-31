const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function createDeck() {
    const deck = [];
    for(let i = 0; i < 21; i++) deck.push('mud');
    for(let i = 0; i < 4; i++) deck.push('rain');
    for(let i = 0; i < 9; i++) deck.push('barn');
    for(let i = 0; i < 4; i++) deck.push('lightning');
    for(let i = 0; i < 4; i++) deck.push('lightning_rod');
    for(let i = 0; i < 8; i++) deck.push('mockery');
    for(let i = 0; i < 4; i++) deck.push('lock');
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    socket.on('joinRoom', (roomCode) => {
        socket.join(roomCode);
        if (!rooms[roomCode]) {
            rooms[roomCode] = { 
                players: [], 
                deck: createDeck(), 
                discard: [], 
                turn: 0, 
                centerCard: null, 
                isStarted: false 
            };
        }
        
        const room = rooms[roomCode];
        if (room.players.length >= 4 || room.isStarted) {
            socket.emit('errorMsg', '입장할 수 없는 방입니다.');
            return;
        }

        const newPlayer = { id: socket.id, hand: [], pigs: [] };
        room.players.push(newPlayer);
        
        io.to(roomCode).emit('updateState', room);
    });

    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if (!room || room.players.length < 2) {
            socket.emit('errorMsg', '최소 2명 이상 모여야 시작할 수 있습니다.');
            return;
        }

        room.isStarted = true;
        const pigCount = room.players.length === 2 ? 5 : room.players.length === 3 ? 4 : 3;

        room.players.forEach(player => {
            player.pigs = Array.from({ length: pigCount }, () => ({
                isDirty: false,
                hasBarn: false,
                hasLightningRod: false,
                hasLock: false
            }));
            
            player.hand = [];
            for(let i = 0; i < 3; i++) {
                if(room.deck.length > 0) player.hand.push(room.deck.pop());
            }
        });

        io.to(roomCode).emit('gameStarted');
        io.to(roomCode).emit('updateState', room);
    });

    socket.on('playCard', ({ roomCode, cardIdx }) => {
        const room = rooms[roomCode];
        if (!room || !room.isStarted || room.players[room.turn].id !== socket.id) return;

        const player = room.players[room.turn];
        const playedCard = player.hand.splice(cardIdx, 1)[0];
        
        room.centerCard = playedCard; 

        if (playedCard === 'rain') {
            room.players.forEach(p => {
                p.pigs.forEach(pig => {
                    if (!pig.hasBarn) pig.isDirty = false;
                });
            });
        }
        
        if (room.deck.length > 0) {
            player.hand.push(room.deck.pop());
        }

        const isWin = player.pigs.length > 0 && player.pigs.every(pig => pig.isDirty);
        if (isWin) {
            io.to(roomCode).emit('gameOver', `${socket.id} 님이 승리했습니다!`);
        } else {
            room.turn = (room.turn + 1) % room.players.length;
            io.to(roomCode).emit('updateState', room);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
