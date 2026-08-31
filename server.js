const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // 정적 파일 제공

// 게임 방 상태 저장
const rooms = {};

// 카드 덱 생성 함수 (검 카드 제외)
function createDeck() {
    const deck = [];
    for(let i=0; i<21; i++) deck.push('mud');
    for(let i=0; i<4; i++) deck.push('rain');
    for(let i=0; i<9; i++) deck.push('barn');
    for(let i=0; i<4; i++) deck.push('lightning');
    for(let i=0; i<4; i++) deck.push('lightning_rod');
    for(let i=0; i<8; i++) deck.push('mockery');
    for(let i=0; i<4; i++) deck.push('lock');
    return deck.sort(() => Math.random() - 0.5); // 셔플
}

io.on('connection', (socket) => {
    socket.on('joinRoom', (roomCode) => {
        socket.join(roomCode);
        if (!rooms[roomCode]) {
            rooms[roomCode] = { players: [], deck: createDeck(), discard: [], turn: 0, centerCard: null };
        }
        
        const room = rooms[roomCode];
        if (room.players.length >= 4) {
            socket.emit('errorMsg', '방이 꽉 찼습니다.');
            return;
        }

        const newPlayer = { id: socket.id, hand: [], pigs: [] };
        room.players.push(newPlayer);
        
       const pigCount = room.players.length === 2 ? 5 : room.players.length === 3 ? 4 : 3;
        
        // 처음 시작할 때 깨끗한 돼지들 생성
        const initialPigs = [];
        for(let i=0; i<pigCount; i++) {
            initialPigs.push({ isDirty: false, hasBarn: false, hasLightningRod: false, hasLock: false });
        }

        // 손에 쥘 카드 3장 뽑기
        const initialHand = [];
        for(let i=0; i<3; i++) {
            if(room.deck.length > 0) initialHand.push(room.deck.pop());
        }

        const newPlayer = { id: socket.id, hand: initialHand, pigs: initialPigs };
        room.players.push(newPlayer);
    });

    socket.on('playCard', ({ roomCode, cardIdx, targetInfo }) => {
        const room = rooms[roomCode];
        if (!room || room.players[room.turn].id !== socket.id) return;

        const player = room.players[room.turn];
        const playedCard = player.hand.splice(cardIdx, 1)[0];
        
        // 6. 모두가 볼 수 있게 중앙에 카드 세팅
        room.centerCard = playedCard; 

        // 카드 효과 적용 (간략화된 예시)
        if (playedCard === 'rain') {
            // 3. 광역 씻기기 효과: 헛간이 없는 모든 돼지를 씻김
            room.players.forEach(p => {
                p.pigs.forEach(pig => {
                    if (!pig.hasBarn) pig.isDirty = false;
                });
            });
        } else if (playedCard === 'mud') {
            // 진흙: 대상 돼지 더럽히기 (자동 "드렉사우!" 처리)
            // targetInfo를 기반으로 처리
        }
        
        // 카드 뽑기 보충 (항상 3장 유지)
        if (room.deck.length > 0) {
            player.hand.push(room.deck.pop());
        }

        // 승리 조건 체크 (모든 돼지가 더러운지)
        const isWin = player.pigs.every(pig => pig.isDirty);
        if (isWin) {
            io.to(roomCode).emit('gameOver', `${socket.id} 님이 승리했습니다!`);
        } else {
            // 턴 넘기기
            room.turn = (room.turn + 1) % room.players.length;
            io.to(roomCode).emit('updateState', room);
        }
    });
});

// 기존: server.listen(3000, () => { ... });
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
});
