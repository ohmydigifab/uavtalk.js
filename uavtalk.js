// This library parses raw uavtalk packets from given data.
// The higher level system is responsible for receiving data over
// a stream,file,whatever, and providing that data to this module
// which will then decode the raw packets and call the callback
// function when a full packet has been received.

var _ = require('underscore');
var bufferpack = require('bufferpack');

var types = {
	0x0 : "OBJ",
	0x1 : "OBJ_REQ",
	0x2 : "OBJ_ACK",
	0x3 : "OBJ_ACK",
	0x4 : "OBJ_NAK",
};

function UavtalkPacketHandler() {
	return {
		pack : function(obj) {

		},
		unpack : function(callback) {
			var headerbuffer = new Buffer(12);
			var headerbufferlen = 0;
			var databuffer = null;
			var datatoread = 0;
			var state = 0;

			var message = {
				type : null,
				object_id : null,
				instance_id : null,
				data : null,
				crc : null
			};
			return function(data) {
				var index = 0;
				var datalen = data.length;

				while (index < datalen) {
					// console.log("TOP state: " + state + ", index: " + index +
					// ",
					// datalen: " + datalen);
					if (state === 0) {
						// sync
						if (data[index] !== 0x3c) {
							console.error("Missed sync");
							++index;
						} else {
							headerbuffer[0] = 0x3c;
							headerbufferlen = 1;
							++state;
							++index;
						}
					} else if (state === 1) {
						// Read the rest of the header into the buffer
						// 10 bytes total
						var tocopy = Math.min(datalen - index, 10 - headerbufferlen);
						data.copy(headerbuffer, headerbufferlen, index, index + tocopy);
						headerbufferlen += tocopy;
						index += tocopy;
						if (headerbufferlen === 10) {
							// Decode the header
							var header = bufferpack.unpack("<BBHiH", headerbuffer);
							datatoread = header[2] - headerbufferlen;
							if (datatoread < 0) {
								datatoread = 0;
							}
							if (datatoread > 255) {
								datatoread = 255;
							}
							databuffer = new Buffer(datatoread);

							message.type = types[header[1] & 0x0f];
							message.object_id = header[3];
							message.instance_id = header[4];
							message.data = databuffer;
							++state;
						}
					} else if (state === 2) {
						var tocopy = Math.min(datalen - index, datatoread);
						data.copy(databuffer, databuffer.length - datatoread, index, index + tocopy);
						datatoread -= tocopy;
						index += tocopy;

						if (datatoread === 0) {
							++state;
						}
					} else if (state === 3) {
						message.crc = data[index];
						callback(message);
						index++;
						state = 0;
					} else {
						throw ("Unknown state");
					}
					if (index > datalen) {
						throw ("SOMETHING IS WRONG");
					}
				}
			}
		}
	}
}

function endsWith(str, suffix) {
	return str.indexOf(suffix, str.length - suffix.length) !== -1;
};

function UavtalkObjectManager(objpath) {
	// console.log("Reading json object defs...");
	var packetHandler = UavtalkPacketHandler();
	var fs = require('fs');
	var path = require('path');

	var uavobjects = {}
	var ready = false;

	fs.readdir(objpath, function(err, files) {
		if (err)
			throw err;

		var count = 1

		function checkdone() {
			count--;
			if (count === 0) {
				ready = true;
			}
		}

		_.each(files, function(filename) {
			if (!endsWith(filename, ".json")) {
				return;
			}
			++count;
			var filename = path.join(objpath, filename);
			fs.readFile(filename, function(err, data) {
				var json = JSON.parse(data);
				var unpackstr = "<"
				_.each(json.fields, function(f) {
					var u;
					if (f.type === 0) {
						// int8
						u = "b"
					} else if (f.type === 1) {
						// int16
						u = "h"
					} else if (f.type === 2) {
						// int32
						u = "i"
					} else if (f.type === 3) {
						// uint8
						u = "B"
					} else if (f.type === 4) {
						// uint16
						u = "H"
					} else if (f.type === 5) {
						// uint32
						u = "I"
					} else if (f.type === 6) {
						// float
						u = "f"
					} else if (f.type === 7) {
						// enum
						u = "B"
					} else {
						throw ("Unknown field type: " + f.type);
					}
					u = u + "(" + f.name + ")";
					if (f.numElements > 1) {
						u = f.numElements.toString(10) + u;
					}
					unpackstr += u;
				});
				json.unpackstr = unpackstr;
				uavobjects[json.object_id] = json;
				checkdone();
			});
		});
		checkdone();

	});

	function unpack_obj(obj, data) {
		var out = {};
		var unpacked = bufferpack.unpack(obj.unpackstr, data);
		if (!unpacked) {
			console.log("Couldn't unpack " + obj.name);
			return null;
		}
		return unpacked;
		// _.each(obj.fields, function(f, index) {
		// out[f.name] = unpacked[index];
		// });
		// return out;
	}

	function pack_obj(obj, data) {
		var packed = bufferpack.pack(obj.unpackstr, data);
		if (!packed) {
			console.log("Couldn't pack " + obj.name);
			return null;
		}
		return packed;
	}

	var warned = {};

	return {
		ready : function() {
			return ready;
		},
		output_stream : function(data) {
		},
		input_stream : function() {
			return packetHandler.unpack(function(packet) {
				if (!this.ready()) {
					return;
				}
				var data = this.decode(packet);
				if (!data) {
					return;
				}
				console.log(data.name);
				// dataemitter.emit(data.name,data);
			});
		},
		decode : function(packet) {
			var obj = uavobjects[packet.object_id];
			if (!obj) {
				if (!warned[packet.object_id]) {
					console.log("JSON Failed to find object");
					console.log(packet);
					warned[packet.object_id] = true;
				}
				return null;
			} else {
				var objdata = unpack_obj(obj, packet.data);
				objdata.name = obj.name;
				return objdata;
			}
		},
		encode : function(data) {
			var obj = uavobjects[data.object_id];
			if (!obj) {
				if (!warned[packet.object_id]) {
					console.log("JSON Failed to find object");
					console.log(packet);
					warned[packet.object_id] = true;
				}
				return null;
			} else {
				var packed = pack_obj(obj, data);
				return packed;
			}
		},
		getInstance : function(objId) {
			return null;
		},
		updateInstance : function(obj) {
			if (output_stream) {
				output_stream(packetHandler.pack(gtsObj));
			}
		}
	}
}

module.exports = {
	ObjectManager : UavtalkObjectManager,
	PacketHandler : UavtalkPacketHandler
};
