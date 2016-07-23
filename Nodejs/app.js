var express = require('express');
var app = express();
var serv = require('http').Server(app);

var AWS = require("aws-sdk");
const YposInterval = 75;

//html 통신
app.get('/',function(req,res) {
	res.sendFile(__dirname + '/client/index.html');
});

app.use('/client',express.static(__dirname + '/client'));

//2000포트로 열기
serv.listen(9000);
console.log("Server Started");

//aws Access Key 가져오기
AWS.config.update({
	accessKeyId : //need AWS IAE accessKEyID,
	secretAccessKey ://need AWS IAE secretAccessKey
});

//aws db지역 선택
AWS.config.update({
	region : "us-east-1",
});

//디비변수
var docClient = new AWS.DynamoDB.DocumentClient();

//GameMakeTask 스캔범위
var params = 
{
	TableName : "GameMakeTask",
	ProjectionExpression:"FacebookId,MaxLevel,MaxScore,UserName",
	FilterExpression: "#sr between :start_Score and :end_Score",
	ExpressionAttributeNames :
	{
		"#sr" : "MaxScore"
	},
	ExpressionAttributeValues:
	{
		":start_Score" : 0,
		":end_Score" : 10000
	}
};

docClient.scan(params,onScan);

var SCAN_LIST = {};

SCAN_INFO = function(FacebookId,MaxLevel,MaxScore,UserName)
{
	this.FacebookId = FacebookId;
	this.MaxLevel = MaxLevel;
	this.MaxScore = MaxScore;
	this.UserName = UserName;
	this.Ypos;
}

function onScan(err,data)
{
	if(err)
		console.err("unable");
	else
	{
		SCAN_LIST = new Array();
		var order = 0;
		
		for(var i = 0 , len = data.Items.length ; i< len ;i++)
		{
			var scan = new SCAN_INFO(data.Items[i].FacebookId, data.Items[i].MaxLevel, data.Items[i].MaxScore, data.Items[i].UserName)
			SCAN_LIST[order] = scan;
			order++;
		}
		
		ScanListArray();
		
		for(var i = 0, len = SCAN_LIST.length; i < len ; i++)
		{
			var scan = SCAN_LIST[i];
			scan.Ypos = i*YposInterval;
			SCAN_LIST[i] = scan;
			/*console.log(
			"FacebookId : " +scan.FacebookId
			+" MaxLevel : " + scan.MaxLevel
			+" MaxScore : " +scan.MaxScore
			+" Name : " +scan.UserName);
			*/
		}
	}
}

//스캔리스트 정렬
function ScanListArray()
{
	for(var i = 0 ; i < SCAN_LIST.length; i++)
	{
		for(var j = 1 ; j <SCAN_LIST.length; j++)
		{
			var ScanInfo1 = SCAN_LIST[j];
			var ScanInfo2 = SCAN_LIST[j-1];
			if(ScanInfo1.MaxScore > ScanInfo2.MaxScore)
			{
				SCAN_LIST[j] = ScanInfo2;
				SCAN_LIST[j-1] = ScanInfo1;
			}
		}
	}
}

var SOCKET_LIST = {};

var AddNewItem = function(data)
{
	var user_TimeInfo;
	user_TimeInfo = 
	{
		TableName : "GameMakeTaskTimeTable",
		Item : 
		{
			"FacebookId" : data.FacebookId,
			"GameFirstStartTime" : data.GameFirstStartTime,
			"GamePlayStartTime" : data.GamePlayStartTime,
			"PlayerDeadTime" : data.PlayerDeadTime,
			"GameEndTime" : data.GameEndTime
		}
	}
	
	docClient.put(user_TimeInfo, function(err,data)
	{
		if (err) {
		console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
		} else {
			console.log("added item:", JSON.stringify(data, null, 2));
		}
	});
}

var UpdateExistItem = function(data)
{
	var user_TimeInfo;
	user_TimeInfo = 
	{
		TableName : "GameMakeTaskTimeTable",
		Key:
		{
			"FacebookId":data.FacebookId
		},
		UpdateExpression : "set GamePlayStartTime = :gps, PlayerDeadTime = :pdt, GameEndTime = :get",
		ExpressionAttributeValues:
		{
			":gps":data.GamePlayStartTime,
			":pdt":data.PlayerDeadTime,
			":get":data.GameEndTime
		}
	}
	
	docClient.update(user_TimeInfo, function(err,data)
	{
		if (err) {
		console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
		} else {
			console.log("updated item:", JSON.stringify(data, null, 2));
		}
	});
}

//클라이언트와 연결
var io = require('socket.io') (serv,{});
io.sockets.on('connection', function(socket) 
{
	console.log('connected with client');
	socket.on('Rank',function()
	{
		console.log('ready to send rank');
		for(var i in SOCKET_LIST)
		{
			var socket = SOCKET_LIST[i];
			for(var i = 0 ; i < SCAN_LIST.length; i++)
				socket.emit('GetRank',SCAN_LIST[i]);
		}
		console.log('success send');
	});
	
	var user_TimeInfo;
	socket.on('TimeSave',
		function(data)
		{
			user_TimeInfo = 
			{
				TableName : "GameMakeTaskTimeTable",
				Key:
				{
					"FacebookId" : data.FacebookId
				}
			}
			
			docClient.get(user_TimeInfo, function(err,data2)
			{
				if (err) {
					console.error("Unable to get item. Error JSON:", JSON.stringify(err, null, 2));
					
				} else {
					console.log("get item:", JSON.stringify(data2, null, 2));
					if(data2.Item == null)
					{
						console.log("Can't FacebookId detective. add new data")
						AddNewItem(data);
					}
					else
					{
						console.log("Can FacebookId detective");
						UpdateExistItem(data);
					}
				}
			});
		}
	);
	
	socket.id = Math.random();
	socket.number = "" + Math.floor(10 * Math.random());
	SOCKET_LIST[socket.id] = socket;
	
	socket.on('disconnect',function(){
        delete SOCKET_LIST[socket.id];
    });
	
});

//클라이언트에 정보 띄워주기
/*setInterval(function(){

    for(var i in SOCKET_LIST){
        var socket = SOCKET_LIST[i];
        socket.emit('newPositions',SCAN_LIST);
    }
	
},1000/25);
*/

//정보 갱신
setInterval(function()
{
	docClient.scan(params,onScan);
},1000);