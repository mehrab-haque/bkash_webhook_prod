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


const CODE_DELIMITER="n"
const products_schema={
  "1":"https://us-central1-engliplan.cloudfunctions.net/payment"
}

var con1 = mysql.createConnection({
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database : process.env.database_1
});

con1.connect(function(err) {
  if (err) throw err;
  console.log("MySQL connected!");
});

var con2 = mysql.createConnection({
  host: process.env.host,
  user: process.env.user,
  password: process.env.password,
  database : process.env.database_2
});

con2.connect(function(err) {
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
        console.log("payment recieved")
        con1.query("INSERT INTO payment_logs (org,trxID,sender,amount,ref,timestamp) VALUES (?,?,?,?,?,?)", [org,trxId,sender,amount,ref,timestamp], function(error, results, fields) {
          if (error){
            console.log("mysql error");
            res.end("error");
          }else{
            console.log("db done");
            if(ref.split(CODE_DELIMITER).length==4){
              var arr=ref.split(CODE_DELIMITER)
              if(arr[0] in products_schema){
                axios.post(products_schema[arr[0]],{
                  code:ref
                }).then(result=>{
                  console.log("posted to product endpoint")
                  res.end('ok')
                }).catch(err=>{
                  res.end("error")
                })
              }else{
                console.log("product not found")
                res.end("error")
              }
            }else{
              console.log("code error")
              res.end("error");
            }
          }
        });
      }
    }
  });
  return;
});

app.post('/user_serial',function(req,res){
  var data=req.body;
  con2.query("INSERT INTO user_serial (uid) VALUES (?)", ['aasas'], function(error, results, fields) {
    if (error){
      console.log("mysql error");
      res.end({error:'database error'})
    }
    res.send({serial:results.insertId+''})
  });
});

app.get("/logs",function(req,res){
  con1.query('SELECT * FROM payment_logs ORDER BY timestamp DESC', function(error, results, fields) {
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
