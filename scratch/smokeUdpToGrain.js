/* Copyright 2016 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

var udpToGrain = require('../boiler/udpToGrain.js');
var pcapInlet = require('../valve/pcapInlet.js');
var H = require('highland');
var SDP = require('../model/SDP.js');

var audioSDP = `v=0
o=- 1443080730 1443080730 IN IP4 172.29.80.68
s=IP Studio Stream
t=0 0
m=audio 5000 RTP/AVP 96
c=IN IP4 232.226.253.166/32
a=source-filter:incl IN IP4 232.226.253.166 172.29.80.68
a=rtpmap:96 L24/48000/2
a=control:trackID=1
a=mediaclk:direct=1970351840 rate=48000
a=extmap:1 urn:x-nmos:rtp-hdrext:origin-timestamp
a=extmap:2 urn:ietf:params:rtp-hdrext:smpte-tc 1920@48000/25
a=extmap:3 urn:x-nmos:rtp-hdrext:flow-id
a=extmap:4 urn:x-nmos:rtp-hdrext:source-id
a=extmap:5 urn:x-nmos:rtp-hdrext:grain-flags
a=extmap:7 urn:x-nmos:rtp-hdrext:sync-timestamp
a=extmap:9 urn:x-nmos:rtp-hdrext:grain-duration
a=ts-refclk:ptp=IEEE1588-2008:ec-46-70-ff-fe-00-42-c4`;


var videoSDP = `v=0
o=- 1443716955 1443716955 IN IP4 172.29.82.50
s=IP Studio Stream
t=0 0
m=video 5000 RTP/AVP 96
c=IN IP4 232.121.83.127/32
a=source-filter:incl IN IP4 232.121.83.127 172.29.82.50
a=rtpmap:96 raw/90000
a=fmtp:96 sampling=YCbCr-4:2:2; width=1920; height=1080; depth=10; colorimetry=BT709-2; interlace=1
a=mediaclk:direct=1119082333 rate=90000
a=extmap:1 urn:x-nmos:rtp-hdrext:origin-timestamp
a=extmap:2 urn:ietf:params:rtp-hdrext:smpte-tc 3600@90000/25
a=extmap:3 urn:x-nmos:rtp-hdrext:flow-id
a=extmap:4 urn:x-nmos:rtp-hdrext:source-id
a=extmap:5 urn:x-nmos:rtp-hdrext:grain-flags
a=extmap:7 urn:x-nmos:rtp-hdrext:sync-timestamp
a=extmap:9 urn:x-nmos:rtp-hdrext:grain-duration
a=ts-refclk:ptp=IEEE1588-2008:ec-46-70-ff-fe-00-42-c4`;

var sdp = new SDP(videoSDP);

var count = 0;
var doto = 0;
pcapInlet('/Volumes/Ormiscraid/media/streampunk/examples/rtp-video-rfc4175-1080i50-sync.pcap')
  .pipe(udpToGrain(sdp))
  .errors(function (err, push) { console.error(err); })
  .each(function (x) { console.log(count++ + ' ' + JSON.stringify(x, null, 2) ); } );
