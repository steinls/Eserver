let express = require('express');
let fs = require('fs');
let path = require('path');
let setWeatherData = require('./lib/weather-data.js');
let credentials = require('./credentials.js');
let flashMessage = require('./lib/flash-message.js');
let sendEmail = require('./lib/email.js');
let favicon = require('serve-favicon');
let cookie = require('cookie-parser')(credentials.cookieSecret);
let session = require('express-session')({
  resave: true,
  saveUninitialized: true,
  secret: credentials.cookieSecret,
});
let bodyParser = require('body-parser');
let morgan = require('morgan');
let fileStreamRotator = require('file-stream-rotator');
let handlebars = require('express3-handlebars').create({
		defaultLayout:'main',
		helpers:{
			section(name,options){
				if(!this._sections){
					this._sections = {};
				}
				this._sections[name] = options.fn(this);
				return null;
			}
		}
	});

let app = express();
let api = require('./router/api.js');
let home = require('./router/home.js');
let users = require('./router/users.js');
let test = require('./router/test.js');

app.set('env','production');

app.engine('handlebars',handlebars.engine);
app.set('view engine', 'handlebars');
app.set('port',process.env.POERT||3000);
app.disable('x-powered-by');

switch(app.get('env')){
	case 'development':
		app.use(morgan('env'));
		break;
	case 'production':
		app.set('view cache',true);
		let logDir = path.join(process.cwd(),'logs');
		fs.existsSync(logDir)||fs.mkdirSync(logDir);
		// let accessLogStream = fs.createWriteStream(path.join(process.cwd(),'Eserver.log'), {flags: 'a'});
		let accessLogStream = fileStreamRotator.getStream({
		  filename: path.join(logDir,'/access-%DATE%.log'),
		  frequency: 'daily',
		  verbose: false
		})
		app.use(morgan('short', {stream: accessLogStream}));
		break;
}

app.use((req,res,next)=>{
	let domain = require('domain').create();
	domain.on('error',(err)=>{
		console.error('Domain error',err.stack);
		try{
			setTimeout(()=>{
				console.log('Fail-safe shutdown！');
				process.exit(1);
			}, 5000);
			let worker = require('cluster').worker;
			if(worker){
				worker.disconnect();
			}
			server.close();
			try{
				next(err);
			}catch(err){
				console.error('Unable to use wrong route, will return a text response. . .',err.stack);
				res.statusCode = 500;
				res.setHeader('content-type','text/plain');
				res.end('sorry this service is currently abnormal.');
			}
		}catch(err){
			console.error('Unable to return error message. . .',err.stack);
		}
		sendEmail('3129335443@qq.com','您的网站出错了！',err.stack);
	});
	domain.add(req);
	domain.add(res);
	domain.run(next);
});

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(cookie);
app.use(session);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true}));
app.use(setWeatherData);
app.use(flashMessage);
app.use(express.static(__dirname+'/public'));

app.use('/api',api);
app.use('/', home);
app.use('/users',users);
app.use('/test',test);
app.get('/epic-fail',(req,res)=>{
	process.nextTick(()=>{
		throw new Error('Worker died');
	});
});



app.use((req,res)=>{
	res.status(404);
	res.render('404');
});

app.use((err,req,res,next)=>{
	console.log(err.stack);
	res.status(500);
	res.render('500');
});

let server;
let log = `started ${app.get('env')} and view_cache ${app.get('view cache')},url:http://localhost:${app.get('port')}`;
let startServer = (log)=>{
	server = app.listen(app.get('port'),(req,res)=>{
		if(log)console.log(log);
	});
};

if(require.main === module){
	startServer(log);
}else{
	module.exports = {
		startServer,
		log
	};
}
