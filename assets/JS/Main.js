var buffer;
var mediaRecorder;
//自己的代號
var name;
//連結的對象
var connectedUser;
//connecting to our signaling server 
//請帶入自己WS server 的ip位置
var wsConn = new WebSocket('ws://127.0.0.1:9090');
// Connection
var yourConn;
//
var dataChannel;

var localPeerConnection, remotePeerConnection, sendChannel, receiveChannel;

cc.Class({
    extends: cc.Component,

    properties: {
        Btn_Start_Recording_node: cc.Button,
        Btn_Stop_Recording_node : cc.Button,
        Btn_Play_Recording_node : cc.Button,
        WebRTC_Login_node       : cc.Button,
    },


    onLoad () {
        self = this;
        this.Btn_Stop_Recording_node.active = false;
        this.Btn_Play_Recording_node.interactable = false; 
        // 取用麥可風
        navigator.mediaDevices.getUserMedia({audio:true}).then(this.MicSuccess).catch(this.MicError);

        // WebSocket 建立連線
        wsConn.onopen = function () {
            console.log('Connected to the signaling server.', 'b');
        };
        
        //當收到從signaling server來的訊息
        wsConn.onmessage = function (msg) {
            console.log("Got message :", msg);
            try {
                var data = JSON.parse(msg.data);
                switch (data.type) {
                    case "login":
                        self.handleLogin(data);
                        break;
                        //when somebody wants to call us 
                    case "offer":
                        console.log(data.name + "進入了!!", 'r');
                        self.handleOffer(data.offer, data.name);
                        break;
                    case "answer":
                        self.handleAnswer(data.answer);
                        break;
                        //when a remote peer sends an ice candidate to us 
                    case "candidate":
                        self.handleCandidate(data.candidate);
                        break;
                    case "leave":
                        console.log('登出成功 ', 'b');
                        self.handleLeave();
                        break;
                    case "hello":
                        console.log(data.message, 'b');
                        //alert(data.message);
                        break;
                    default:
                        break;
        
                }
            }
            catch (e) {
                console.log('signaling server error : ' + msg.data + " 。Exception Message :" + e);
            }
        
        
        };
        
        // Wwbsocker
        wsConn.onerror = function (err) {
            console.log("Web Socket Connection 發生錯誤 : " + JSON.stringify(err), 'r');
        };
    },

 
     /////////////////////////////////WEBRTC錄音//////////////////////////////
     MicSuccess: function(stream) {
        const audioTracks = stream.getAudioTracks();
        //取得麥克風設備
        console.log('Using audio device: ' + audioTracks[0].label);
        window.stream = stream; // make variable available to browser console
    },
    
    MicError: function(error) {
        console.log('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
    },

    startRecord: function(){
        console.log('開始錄音');
        this.Btn_Stop_Recording_node.active  = true;
        this.Btn_Start_Recording_node.active = false;
        buffer = [];
        mediaRecorder = new MediaRecorder(window.stream,{audio:true});
        mediaRecorder.ondataavailable = this.handleDataAvailable;
        mediaRecorder.start(10) //每隔10毫秒存储一块数据
    },

    handleDataAvailable: function(e) {
        buffer.push(e.data);
        console.log(e.data);
    },

    stopRecord: function() {
        console.log('停止錄音');
        this.Btn_Play_Recording_node.interactable = true; 
        this.Btn_Stop_Recording_node.active  = false;
        this.Btn_Start_Recording_node.active = true;
        mediaRecorder.stop();
    },

    btnPlay: function(){
        console.log('開始播放錄音');
        let blob = new Blob(buffer, { type: 'audio/mp3' });
        // var blob = new Blob(buffer, { type: 'audio/mp3' });
        let path = window.URL.createObjectURL(blob);
        // 播放url音樂
        let blobplayer = new window.Audio();
        blobplayer.src = path;
        blobplayer.play();
        
        
    },

    /////////////////////////////////WEBRTC錄音//////////////////////////////
    
    ////////////////////////////////WEBRTC PEER//////////////////////////
    
    //寄送給signaling server (ws))
    ws_send:function(message){
        //attach the other peer username to our messages 
        if (connectedUser) {
            message.name = connectedUser;
        }
    
        wsConn.send(JSON.stringify(message));
    },



    btn_login: function(obj,event){
        name = 'PERSON'+event;
            this.ws_send({
                type: "login",
                name: name
            });
    },

    btn_logout: function(){
        this.ws_send({
            type: "leave",
            name: name
        });
    },

    Call_offer: function(){
        var callToUsername = 'PERSON2';
        self = this;
        if (callToUsername.length > 0) {
            connectedUser = callToUsername;
            // 提出申請
            yourConn.createOffer(function (offer) {
                self.ws_send({
                    type: "offer",
                    offer: offer
                });
                yourConn.setLocalDescription(offer);
            }, function (error) {
                alert("Error when creating an offer");
            });
        }
    },

    Peer_send: function(){
        if (buffer) {
            let blob = new Blob(buffer, { type: 'audio/mp3' });
            var data = null;
            const fr = new FileReader()
            fr.addEventListener('load', function(event) {
                console.log(this.result)    // [object ArrayBuffer]
                /*
                * 接著如果想真正讀出ArrayBuffer內容
                * 必須將其轉成Uint8Array, 原因是
                * 在ArrayBuffer中每個字節 = 8位元, 因此須先轉為Unit8Array
                */
                data = this.result;
                const ab = this.result
                const u8 = new Uint8Array(ab)
                for(let i of u8) {
                    // console.log(i)    // 0 0 0 0 0 0 0 0
                }
                dataChannel.send(data);
            })
            fr.readAsArrayBuffer(blob)

            // dataChannel.send(data);
            console.log('送出資料為: ', data);
        } else {
            console.log('你沒有輸入', 'r');
        }
    },


    
    //After Connected Action 
    //Type:login 
    //處理登入後的狀態，收到type:login的時候呼叫
    handleLogin: function(data) {
        console.log("登入的data: ",data,name);
        self = this;
        if (data.success === false) {
            console.log('[Error] : ' + data.message, 'r');
        } else {

            //********************** 
            //Starting a peer connection 
            //建立起自己為一個可Connection的端點
            //********************** 

            //using Google public stun server 
            console.log('登入成功 :' + name, 'b');
            var configuration = {
                "iceServers": [{ "url": "stun:stun2.l.google.com:19302" }]
            };

            //  yourConn = new webkitRTCPeerConnection(configuration, { optional: [{ RtpDataChannels: true }] });
            yourConn = new webkitRTCPeerConnection(configuration);
            //creating data channel 
            dataChannel = yourConn.createDataChannel("Binary", {reliable: true});

            // Setup ice handling 
            yourConn.onicecandidate = function (event) {
                if (event.candidate) {
                    console.log('送出 candidate :' + JSON.stringify(event.candidate), 'b');
                    self.ws_send({
                        type: "candidate",
                        candidate: event.candidate
                    });
                }
            };
            //收資料
            yourConn.ondatachannel = function (event) {
                var receiveChannel = event.channel;
                console.log(receiveChannel)
                receiveChannel.onmessage = function (event) {
                    console.log(event.data)
                    // return;
                    // let blob = new Blob([event.data], { type: 'audio/mp3' });
                    const blob = new Blob([event.data])
                    let path = window.URL.createObjectURL(blob);
                    console.log(path)
                    // 播放url音樂
                    let blobplayer = new window.Audio();
                    blobplayer.src = path;
                    blobplayer.play();
                    console.log(connectedUser + ": " + event.data);
                    console.log(event.data);
                
                };
            };
            dataChannel.onerror = function (error) {
                console.log("Ooops...error:", error);
            };

            //when we receive a message from the other peer, display it on the screen 
            dataChannel.onmessage = function (event) {
                let byteArray = new Uint8Array(event.data);
                let hexString = "";
                byteArray.forEach(function(byte) {
                    hexString += byte.toString(16) + " ";
                });
                console.log('dataChannel.onmessage hexString :' + connectedUser + ": " + hexString);
                // chatArea.innerHTML += connectedUser + ": " + event.data + "<br />";
                console.log('dataChannel.onmessage :' + connectedUser + ": " + event.data);
            };

            dataChannel.onclose = function () {
                console.log("data channel is closed");
            };
        }
    },

    //Candidate
    //when we got an ice candidate from a remote user 
    //被呼叫端收到邀請呼叫該func
    handleCandidate: function(candidate) {

        yourConn.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("Got Candidate(收到邀請) -" + JSON.stringify(candidate), 'b');
    },

    //Offer 
    //when somebody sends us an offer 
    handleOffer: function(offer, name) {
        //  alert(offer + name);
        console.log("handleOffer", offer + ",,," + name);
        self = this;
        connectedUser = name;
        yourConn.setRemoteDescription(new RTCSessionDescription(offer));

        //create an answer to an offer 
        yourConn.createAnswer(function (answer) {
            console.log("createAnswer answer:" + answer, 'b');
            yourConn.setLocalDescription(answer);
            self.ws_send({
                type: "answer",
                answer: answer
            });
        }, function (error) {;
            console.log("Error when creating an answer" + error, 'r');
            // alert("Error when creating an answer");
        });
    },

    //Candidate
    //when we got an ice candidate from a remote user 
    //被呼叫端收到邀請呼叫該func
    handleCandidate: function(candidate) {
        // console.log(candidate)
        yourConn.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("Got Candidate(收到邀請) -" + JSON.stringify(candidate), 'b');
    },

    //Answer
    //when we got an answer from a remote user 
    handleAnswer: function(answer) {
        yourConn.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("Got Answer(收到回應) -" + JSON.stringify(answer), 'b');
    },

    
        

});
