var fs = require('fs');
var axios = require('axios');
var MessageValidator = require('sns-validator');
var express = require("express");
var cors = require('cors');
var bodyParser = require("body-parser");
var mysql = require('mysql');

var validator = new MessageValidator();

var app = express();
app.use(function (req, res, next) {
  if (req.get('x-amz-sns-message-type')) {
    req.headers['content-type'] = 'application/json';
  }
  next();
});
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

var con = mysql.createConnection({
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database : process.env.database
});

con.connect(function(err) {
  if (err) throw err;
  console.log("MySQL connected!");
});

app.post('/bkash_production',function(req,res){
  var data=req.body;
  validator.validate(data, function (err, message) {
    if (err) {
      res.end("error");
    }else{
      if(data["Type"]==="SubscriptionConfirmation"){
        var url=data["SubscribeURL"];
        axios.get(url).then(res1=>{
          fs.writeFileSync("logs/"+Date.now()+".json",JSON.stringify(data));
          res.end("ok");
        }).catch(err=>{
          res.end("error");
        });
      }
      else if(data["Type"]==="Notification"){
        var msg_json=JSON.parse(data["Message"]);
        var amount=msg_json["amount"];
        var ref="-";
        if("transactionReference" in msg_json)ref=msg_json["transactionReference"];
        var sender=msg_json["debitMSISDN"];
        var org=msg_json["creditOrganizationName"];
        var timestamp=msg_json["dateTime"];
        var trxId=msg_json["trxID"];
        con.query("INSERT INTO bkash_production (org,trxID,sender,amount,ref,timestamp) VALUES (?,?,?,?,?,?)", [org,trxId,sender,amount,ref,timestamp], function(error, results, fields) {
          if (error){
            res.end("error");
            console.log("mysql error");
          }
          console.log("db done");
          res.end("ok");
          /*else{
            console.log("mysql done");
            if(product!="-"){
              axios.post(product["endpoint"],{
                "amount":amount,
                "reference":ref
              }).then(result=>{
                console.log("db done");
                res.end("ok");
              }).catch(error=>{
                console.log("db error");
                res.end("error");
              })
            }else{
              res.end("ok");
            }
          }*/
        });
      }
    }
  });
  return;
});

app.get("/logs",function(req,res){
  con.query('SELECT * FROM bkash_production ORDER BY timestamp DESC', function(error, results, fields) {
    if(error){
      res.send({
        "status":"couldn't get data"
      });
    }
    else {
      res.send(results);
    }
  });
});

const port = process.env.port||3000
app.listen(port,function(){
  console.log(`server started on PORT ${port}`);
})