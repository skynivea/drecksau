const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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

function checkAndReshuffleDeck(room) {
    if (room.deck.length === 0 && room.discard.length > 0) {
        room.deck = room.discard.sort(() => Math.random() - 0.5);
        room.discard = [];
    }
}

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomCode: rawCode, nickname }) => {
        if (!rawCode) return;
        const roomCode = String(rawCode).trim().toUpperCase();
        const userNickname = (nickname && nickname.trim()) ? nickname.trim() : '익명';

        Array.from(socket.rooms).forEach(r => {
            if (r !== socket.id) socket.leave(r);
        });

        socket.join(roomCode);

        if (!rooms[roomCode]) {
            rooms[roomCode] = { 
                players: [], 
                deck: createDeck(), 
                discard: [], 
                turn: 0, 
                centerCard: null, 
                isStarted: false,
                hostId: socket.id 
            };
        }
        
        const room = rooms[roomCode];
        const existingPlayer = room.players.find(p => p.id === socket.id);
        
        if (!existingPlayer) {
            if (room.players.length >= 4 || room.isStarted) {
                socket.emit('errorMsg', '입장할 수 없는 방이거나 이미 게임이 시작되었습니다.');
                socket.leave(roomCode);
                return;
            }
            room.players.push({ id: socket.id, nickname: userNickname, hand: [], pigs: [] });
        } else {
            existingPlayer.nickname = userNickname;
        }
        
        io.to(roomCode).emit('updateState', room);
    });

    socket.on('startGame', (rawRoomCode) => {
        const roomCode = String(rawRoomCode).trim().toUpperCase();
        const room = rooms[roomCode];

        if (!room) return;
        if (room.hostId !== socket.id) {
            socket.emit('errorMsg', '방장만 게임을 시작할 수 있습니다!');
            return;
        }
        if (room.players.length < 2) {
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
                checkAndReshuffleDeck(room);
                if(room.deck.length > 0) player.hand.push(room.deck.pop());
            }
        });

        io.to(roomCode).emit('gameStarted');
        io.to(roomCode).emit('updateState', room);
    });

    socket.on('playCard', ({ roomCode: rawCode, cardIdx, targetPlayerId, targetPigIdx }) => {
        const roomCode = String(rawCode).trim().toUpperCase();
        const room = rooms[roomCode];
        if (!room || !room.isStarted) return;
        
        const playerIdx = room.players.findIndex(p => p.id === socket.id);
        if (playerIdx !== room.turn) {
            socket.emit('errorMsg', '당신의 차례가 아닙니다!');
            return;
        }

        const player = room.players[playerIdx];
        const card = player.hand[cardIdx];
        let isValidMove = false;

        const targetPlayer = room.players.find(p => p.id === targetPlayerId);
        const pigIdx = parseInt(targetPigIdx, 10);
        const targetPig = (targetPlayer && !isNaN(pigIdx) && targetPlayer.pigs[pigIdx]) ? targetPlayer.pigs[pigIdx] : null;

        if (card === 'mud') {
            if (targetPlayerId === player.id && targetPig && !targetPig.isDirty) {
                targetPig.isDirty = true;
                isValidMove = true;
            }
        } else if (card === 'rain') {
            room.players.forEach(p => {
                p.pigs.forEach(pig => {
                    if (!pig.hasBarn) pig.isDirty = false;
                });
            });
            isValidMove = true;
        } else if (card === 'barn') {
            if (targetPlayerId === player.id && targetPig && !targetPig.hasBarn) {
                targetPig.hasBarn = true;
                isValidMove = true;
            }
        } else if (card === 'lightning') {
            if (targetPlayerId !== player.id && targetPig && targetPig.hasBarn && !targetPig.hasLightningRod) {
                targetPig.hasBarn = false;
                targetPig.hasLock = false;
                isValidMove = true;
            }
        } else if (card === 'lightning_rod') {
            if (targetPlayerId === player.id && targetPig && targetPig.hasBarn && !targetPig.hasLightningRod) {
                targetPig.hasLightningRod = true;
                isValidMove = true;
            }
        } else if (card === 'mockery') {
            if (targetPlayerId !== player.id && targetPig && targetPig.hasBarn && targetPig.isDirty && !targetPig.hasLock) {
                targetPig.isDirty = false;
                isValidMove = true;
            }
        } else if (card === 'lock') {
            if (targetPlayerId === player.id && targetPig && targetPig.hasBarn && !targetPig.hasLock) {
                targetPig.hasLock = true;
                isValidMove = true;
            }
        }

        if (isValidMove) {
            player.hand.splice(cardIdx, 1);
            room.discard.push(card);
            room.centerCard = card;

            checkAndReshuffleDeck(room);
            if (room.deck.length > 0) {
                player.hand.push(room.deck.pop());
            }

            const isWin = player.pigs.length > 0 && player.pigs.every(pig => pig.isDirty);
            if (isWin) {
                io.to(roomCode).emit('gameOver', `🎉 [${player.nickname}] 님이 승리했습니다!`);
                delete rooms[roomCode];
                return;
            }

            room.turn = (room.turn + 1) % room.players.length;
            io.to(roomCode).emit('updateState', room);
        } else {
            socket.emit('errorMsg', '선택한 카드나 돼지가 규칙에 맞지 않습니다!');
        }
    });

    socket.on('discardHand', ({ roomCode: rawCode }) => {
        const roomCode = String(rawCode).trim().toUpperCase();
        const room = rooms[roomCode];
        if (!room || !room.isStarted) return;
        
        const playerIdx = room.players.findIndex(p => p.id === socket.id);
        if (playerIdx !== room.turn) {
            socket.emit('errorMsg', '당신의 차례가 아닙니다!');
            return;
        }

        const player = room.players[playerIdx];
        room.discard.push(...player.hand);
        player.hand = [];

        for (let i = 0; i < 3; i++) {
            checkAndReshuffleDeck(room);
            if (room.deck.length > 0) player.hand.push(room.deck.pop());
        }

        room.centerCard = 'discard_all';
        room.turn = (room.turn + 1) % room.players.length;
        io.to(roomCode).emit('updateState', room);
    });

    // 실시간 채팅 메시지 수신 및 전달
    socket.on('sendChat', ({ roomCode: rawCode, message }) => {
        const roomCode = String(rawCode).trim().toUpperCase();
        const room = rooms[roomCode];
        if (!room || !message || !message.trim()) return;

        const player = room.players.find(p => p.id === socket.id);
        const senderName = player ? player.nickname : '익명';

        io.to(roomCode).emit('receiveChat', {
            sender: senderName,
            message: message.trim()
        });
    });

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                } else {
                    if (room.hostId === socket.id) {
                        room.hostId = room.players[0].id;
                    }
                    if (room.isStarted && room.players.length === 1) {
                        io.to(roomCode).emit('gameOver', '상대방이 나가 홀로 남았습니다. 승리!');
                        delete rooms[roomCode];
                        return;
                    }
                    if (room.turn >= room.players.length) room.turn = 0;
                    io.to(roomCode).emit('updateState', room);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
