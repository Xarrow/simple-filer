var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var fs = require('fs');
var routes = require('./routes/index');
var crypto = require('crypto');

var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

var privateKey = fs.readFileSync('ssl/key.pem', 'utf8');
var certificate = fs.readFileSync('ssl/cert.pem', 'utf8');
var credentials = {key: privateKey, cert: certificate};
var httpsServer = require('https').createServer(credentials, app);
httpsServer.listen(8443, function(){
  console.log('server started on port: 8443.')
});

const WebSocket = require('ws');
const wss = new WebSocket.Server({
  server: httpsServer,
  clientTracking: true   // to store all connected clients in a set, so you can run forEach on them.
});

var users = {}; // key is userID(generated by randomBytes in hex), value is webSocket obj
wss.on('connection', function(ws){
  var userID = '';
  crypto.randomBytes(4, function(err, buffer){
    if (err) throw err;
    ws._uid = userID = buffer.toString('hex'); // not a good idea to attach uid on ws socket object
    wss.clients.forEach(client => {
      if (ws !== client && client.readyState === WebSocket.OPEN){// other users need to be notified of this new comer's presence
        client.send(JSON.stringify({
          msgType: 'newUser',
          userID: userID
        }))
      }
    });
    ws.send(JSON.stringify({
      msgType: 'profile',
      userID: userID,
      peersID: Object.keys(users) // at this moment, users obj doesn't contain the current new socket client
    })); // because I need to list all other users on the client's page for user to choose, then send file.
    users[ userID ] = ws;
  });

  ws.on('message', msg => {
    try{
      var msgObj = JSON.parse(msg);
      console.log('parsed msg: ', msgObj);
      switch (msgObj.msgType) {
        case "signaling":
          console.log('signaling data');
          console.log('online users: ', users);
          var targetClient = users[msgObj.to];
          if (targetClient && targetClient.readyState === WebSocket.OPEN){
            console.log('relay signaling: ', msgObj);
            targetClient.send(msg)
          }
          break;
        default: console.log('Oops. unknown msg: ', msgObj)
      }
    } catch (e){
      console.log('Oops, unknown msg: ', e)
    }
  });

  ws.on('close', () => {
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN){
        client.send(JSON.stringify({
          msgType: 'removeUser',
          userID: ws._uid
        }))
      }
    });
    delete users[ ws._uid ]
  });
  ws.on('error', err => {
    console.log('err on ', ws._uid, ': ', err);
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN){
        client.send(JSON.stringify({
          msgType: 'removeUser',
          userID: ws._uid
        }))
      }
    });
    delete users[ ws._uid ]
  })

});

app.use('/', routes);

app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;