var async = require('async');
var Uavtalk = require("uavtalk");
var EventEmitter = require('events').EventEmitter;
var SerialPort = require("serialport").SerialPort;

var objMan = new Uavtalk.ObjectManager("./openpilot_definitions");
var gtsObj;
var ftsObj;

var STATUS_DISCONNECTED = 0;
var STATUS_HANDSHAKEREQ = 1;
var STATUS_HANDSHAKEACK = 2;
var STATUS_CONNECTED = 3;

function getBlankGtsObj() {
	var gtsObj = {};
	gtsObj.TxDataRate = 0;
	gtsObj.TxBytes = 0;
	gtsObj.TxFailures = 0;
	gtsObj.TxRetries = 0;
	gtsObj.RxDataRate = 0;
	gtsObj.RxBytes = 0;
	gtsObj.RxFailures = 0;
	gtsObj.RxSyncErrors = 0;
	gtsObj.RxCrcErrors = 0;
	gtsObj.Status = 0;
	gtsObj.name = "GCSTelemetryStats";
	gtsObj.object_id = objMan.getObjectId(gtsObj.name);
	return gtsObj;
}

async.waterfall([ function(callback) {
	objMan.init(function() {
		callback(null);
	});
}, function(callback) {
	var sp = new SerialPort("/dev/ttyAMA0", {
		baudrate : 57600
	});
	objMan.output_stream = function(data) {
		console.log("data");
		console.log(data);
		sp.write(data, function() {
			sp.drain();
		});
	};
	sp.on("data", objMan.input_stream);
	sp.on("open", function() {
		callback(null);
	});
}, function(callback) {
	objMan.requestObject("FlightTelemetryStats", function(obj) {
		callback(null, obj);
	});
}, function(obj, callback) {
	gtsObj = getBlankGtsObj();
	var connection = function(obj) {
		ftsObj = obj;
		console.log(ftsObj);
		if (ftsObj.Status == STATUS_DISCONNECTED) {
			gtsObj.Status = STATUS_HANDSHAKEREQ;
			console.log(gtsObj);
			objMan.updateObject(gtsObj);
		} else if (ftsObj.Status == STATUS_HANDSHAKEACK) {
			gtsObj.Status = STATUS_CONNECTED;
			console.log(gtsObj);
			objMan.updateObject(gtsObj);
		} else if (ftsObj.Status == STATUS_CONNECTED) {
			console.log("connected");
			callback(null);
			return;
		}
		objMan.requestObject("FlightTelemetryStats", connection);
	};
	connection(obj);
}, function(callback) {
	if (process.argv[2] == null) {
		callback(null);
		return;
	}
	console.log("get " + process.argv[2]);
	objMan.requestObject(process.argv[2], function(obj) {
		callback(null, obj);
	});
} ], function(err, result) {
	console.log(result);
	console.log("done!")
});
