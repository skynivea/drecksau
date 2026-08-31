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

function checkAndReshuffleDeck(room) {
    if (room.deck.length === 0 && room.discard.length > 0) {
        room.deck = room.discard.sort(() => Math.random() - 0.5);
        room.discard = [];
    }
}

io.on('connection', (socket) => {
socket.on('joinRoom', (rawRoomCode) => {
        if (!rawRoomCode) return;

        // 방 코드 정제 (문자열 변환 + 공백 제거 + 대문자 변환)
        const roomCode = String(rawRoomCode).trim().toUpperCase();

        // 기존에 참여 중이던 소켓 룸이 있다면 이탈 처리
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
                isStarted: false 
            };
        }
        
        const room = rooms[roomCode];

        // 이미 참여 중인 플레이어인지 체크하여 중복 추가 방지
        const existingPlayer = room.players.find(p => p.id === socket.id);
        if (!existingPlayer) {
            if (room.players.length >= 4 || room.isStarted) {
                socket.emit('errorMsg', '입장할 수 없는 방입니다.');
                return;
            }
            const newPlayer = { id: socket.id, hand: [], pigs: [] };
            room.players.push(newPlayer);
        }
        
        // 방에 있는 모든 유저에게 인원 수 및 정보 갱신 신호 전송
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
                checkAndReshuffleDeck(room);
                if(room.deck.length > 0) player.hand.push(room.deck.pop());
            }
        });

        io.to(roomCode).emit('gameStarted');
        io.to(roomCode).emit('updateState', room);
    });

    socket.on('playCard', ({ roomCode, cardIdx, targetPlayerId, targetPigIdx }) => {
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

        let targetPlayer = room.players.find(p => p.id === targetPlayerId);
        let targetPig = (targetPlayer && targetPigIdx !== undefined) ? targetPlayer.pigs[targetPigIdx] : null;

        // 카드 효과 판정 로직
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
                io.to(roomCode).emit('gameOver', `${player.id} 님이 승리했습니다!`);
                delete rooms[roomCode];
                return;
            }

            room.turn = (room.turn + 1) % room.players.length;
            io.to(roomCode).emit('updateState', room);
        } else {
            socket.emit('errorMsg', '올바른 대상을 선택하세요!');
        }
    });

    // 손털기 (사용 가능한 카드가 없을 때 3장 모두 버리고 뽑기)
    socket.on('discardHand', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || !room.isStarted) return;
        
        const playerIdx = room.players.findIndex(p => p.id === socket.id);
        if (playerIdx !== room.turn) return;

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

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                } else {
                    if (room.turn >= room.players.length) room.turn = 0;
                    io.to(roomCode).emit('updateState', room);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
