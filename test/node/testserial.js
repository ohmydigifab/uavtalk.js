var async = require('async');
var Uavtalk = require("uavtalk");
var EventEmitter = require('events').EventEmitter;
var SerialPort = require("serialport").SerialPort;

var objMan = new Uavtalk.ObjectManager("./openpilot_definitions");
var gtsObj;
var ftsObj;

async.waterfall([ function(callback) {
	objMan.init(function() {
		callback(null);
	});
}, function(callback) {
	var sp = new SerialPort("/dev/ttyAMA0", {
		baudrate : 57600
	});
	objMan.output_stream = function(data) {
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
	objMan.requestObject("GCSTelemetryStats", function(obj) {
		callback(null, obj);
	});
}, function(obj, callback) {
	gtsObj = obj;
	console.log(gtsObj);
	objMan.requestObject("FlightTelemetryStats", function(obj) {
		callback(null, obj);
	});
}, function(obj, callback) {
	ftsObj = obj;
	console.log(ftsObj);
	if (ftsObj && ftsObj.Status == 0) {
		gtsObj.Status = 1;
		gtsObj.TxDataRate = 0;
		gtsObj.RxDataRate = 0;
		objMan.updateObject(gtsObj);
	}
	objMan.requestObject("FlightTelemetryStats", function(obj) {
		callback(null, obj);
	});
}, function(obj, callback) {
	ftsObj = obj;
	console.log(ftsObj);
	callback(null);
} ], function(err, result) {

});
