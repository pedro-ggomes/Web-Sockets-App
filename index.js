
import { Server } from 'socket.io';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3500;
const ADMIN = "Admin";

const app = express();

app.use(express.static(path.join(__dirname, "public")));

const expressServer = app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`);
});

// state
const UsersState = {
    users:[],
    setUsers: function(newUsersArray){
        this.users = newUsersArray;
    }
}

const io = new Server(expressServer, {
	cors: {
		origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5500","http://127.0.0.1:5500"]
	}
})

io.on('connection', socket => {
	console.log(`User ${socket.id} connected`);

    // Upon connection - only to the user
    socket.emit('message', buildMessage(ADMIN,"Welcome to chat app!"));

    socket.on('enterRoom',({name,room}) => {
        // Leave previous room
        const prevRoom = getUser(socket.id)?.room;

        if(prevRoom){
            socket.leave(prevRoom);
            io.to(prevRoom).emit('message', buildMessage(ADMIN, `${name} has left the room`));
        }
        
        const user = activateUser(socket.id, name, room);

        // cannot update prev room users list until after userstate update
        if (prevRoom){
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }

        // join new room
        socket.join(user.room);

        // to user who joined
        socket.emit('message', buildMessage(ADMIN, `You have joined the ${user.room} chat room`));

        // to everybody else
        socket.broadcast.to(user.room).emit('message', buildMessage(ADMIN, `User: ${user.name} has joined the ${user.room} chat room`))

        // update user list for room
        io.to(user.room).emit('userList', {
            users: getUsersInRoom(user.room)
        })

        // update room list for everyone
        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })

        console.log(`User ${socket.id} disconnected`);
    })

    // listen for activity
    socket.on('activity', (name) => {
        const room = getUser(socket.id)?.room;
        if(room){
            socket.broadcast.to(room).emit('activity',name);
        }
    })

    // Listening for a message event
	socket.on('message', ({name,text}) => {
		const room = getUser(socket.id)?.room;
        if(room){
            io.to(room).emit('message', buildMessage(name, text))
        }
	})

    // When user disconnects - to all others
    socket.on('disconnect', () => {
        const id = socket.id;
        const user = getUser(id);
        userLeavesApp(id);
        
        if (user) {
            io.to(user.room).emit('message', buildMessage(ADMIN,`${user.name} has left the room`));

            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            });

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            });
        }
    })


})

function buildMessage(name, text){
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour:'numeric',
            minute:'numeric',
            second:'numeric'
        }).format(new Date())
    }
}

// User functions
function activateUser(id, name, room){
    const user = {id, name, room};
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id !== id),
        user
    ]);
    return user;
}

function userLeavesApp(id){
    UsersState.setUsers(
        UsersState.users.filter(user => user.id !== id)
    );
}

function getUser(id){
    return UsersState.users.find(user => user.id === id);
}

function getUsersInRoom(room){
    return UsersState.users.filter(user => user.room === room);
}

function getAllActiveRooms(){
    return Array.from(new Set(UsersState.users.map(user => user.room)));
}