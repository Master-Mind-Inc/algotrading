var express = require("express");
// var cors = require('cors')
var app = express();
var bodyParser = require("body-parser");
require('dotenv').config();
require('./global').define();

const routes = require('./routes');

// app.use(cors());
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(bodyParser.json());
app.use(routes);

app.listen(process.env.API_PORT, function () { 
    console.log('You can use http://127.0.0.1:'+process.env.API_PORT);
})