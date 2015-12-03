// This library parses raw uavtalk packets from given data.
// The higher level system is responsible for receiving data over
// a stream,file,whatever, and providing that data to this module
// which will then decode the raw packets and call the callback
// function when a full packet has been received.

var _ = require('underscore');
var bufferpack = require('bufferpack');

var SYNC = 0x3C;
var VERSION_MASK = 0xFC;
var VERSION = 0x20;
var TYPE_MASK = 0x03;
var TYPE_OBJ = 0x00;
var TYPE_OBJ_REQ = 0x01;
var TYPE_OBJ_ACK = 0x02;
var TYPE_ACK = 0x03;

var MIN_HEADER_LENGTH = 10;// # sync(1), type (1), size(2), object ID(4),
// instance ID(2)
var MAX_HEADER_LENGTH = 12;// # sync(1), type (1), size(2), object ID (4),
// instance ID(2), TIMESTAMP(2 not used in single
// objects)

var MAX_PAYLOAD_LENGTH = 255;//
var CHECKSUM_LENGTH = 1;//
var MAX_PACKET_LENGTH = (MAX_HEADER_LENGTH + MAX_PAYLOAD_LENGTH + CHECKSUM_LENGTH);//

var types = {
	0x0 : "OBJ",
	0x1 : "OBJ_REQ",
	0x2 : "OBJ_ACK",
	0x3 : "OBJ_ACK",
	0x4 : "OBJ_NAK",
};

function UavtalkPacketHandler() {
	return {
		getPacket : function(type, object_id, data) {
			
			header = new Buffer([ SYNC, type | VERSION, 0, 0, 0, 0, 0, 0 ]);

			length = MIN_HEADER_LENGTH;
			if (data != null) {
				length += data.length;
			}
			header[2] = length & 0xFF;
			header[3] = (length >> 8) & 0xFF;
			// for i in xrange(4,8):
			// header[i] = object_id & 0xff
			// object_id >>= 8

			// crc = Crc()
			// crc.addList(header)
			// self.stream.write("".join(map(chr,header)))

			// if data != None:
			// crc.addList(data)
			// self.stream.write("".join(map(chr,data)))
			//	        
			// self.stream.write(chr(crc.read()))

			return header;
		},
		getRequestPacket : function(object_id) {
			this.getPacket(TYPE_OBJ_REQ, object_id, null);
		},
		pack : function(obj) {
			var headerbuffer = new Buffer(10);
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
						if (data[index] !== SYNC) {
							console.error("Missed sync");
							++index;
						} else {
							headerbuffer[0] = SYNC;
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
	var uavobject_name_index = {}
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
				uavobject_name_index[json.name] = json.object_id;
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
	var requested = {};

	var self = {
		ready : function() {
			return ready;
		},
		output_stream : function(data) {
		},
		input_stream : function() {
			return packetHandler.unpack(function(packet) {
				if (!self.ready()) {
					return;
				}
				var instance = self.decode(packet);
				if (!instance) {
					return;
				}
				var obj = uavobjects[instance.object_id];
				if (!obj) {
					console.log(instance);
					return;
				}
				obj.instance = instance;

				if (requested[instance.object_id]) {
					_.each(requested[instance.object_id], function(callback) {
						callback(instance);
					});
					delete requested[instance.object_id];
				}
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
				objdata.object_id = packet.object_id;
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
		getInstance : function(object_id) {
			if (typeof (object_id) == 'string') {
				object_id = uavobject_name_index[object_id];
			}
			var obj = uavobjects[object_id];
			if (!obj) {
				return null;
			}
			return obj.instance;
		},
		requestInstance : function(object_id, callback) {
			if (typeof (object_id) == 'string') {
				object_id = uavobject_name_index[object_id];
			}
			var obj = uavobjects[object_id];
			if (!obj) {
				return null;
			}
			if (requested[object_id] == null) {
				requested[object_id] = [];
			}
			requested[object_id].push(callback);
			if (output_stream) {
				output_stream(packetHandler.pack(packetHandler.getRequestPacket(object_id)));
			}
		},
		updateInstance : function(obj) {
			if (output_stream) {
				output_stream(packetHandler.pack(obj));
			}
		}
	}
	return self;
}

module.exports = {
	ObjectManager : UavtalkObjectManager,
	PacketHandler : UavtalkPacketHandler
};
