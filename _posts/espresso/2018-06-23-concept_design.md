---
layout: post
title: '基于Espresso的Android UI自动化框架设计之二'
subtitle: '蓝图绘制 -- 自动化测试框架设计'
date: 2018-06-23
author: 雨落寒霜
tags: espresso Android UI自动化 Junit4
---
>一套完整的自动化解决方案, 必须有一套完整的框架来支撑, 其必将贯彻整个测试的生命周期,
 从测试开始至最终的报告展示.  
 
 本系列项目位于`github:` [https://github.com/rawqing/EspressoBlackBoxDemo](https://github.com/rawqing/EspressoBlackBoxDemo)

### 框架构思
不想自己coding一整套框架, 我们也一样可以通过各种零件组装起来.  
1. espresso :   
    这是基础工具 , 我们所有的代码都是在此基础之上编写的.
    
1. AndroidJunit4 :  
    这是google官方推荐的 Android 测试运行工具 .
    我们也可以在此基础之上定义我们自己的 `Runner` . 当然也有其他的运行方式.  
    
1. [JUnitParams](http://pragmatists.github.io/JUnitParams/) :  
    该框架提供了更简单易读的参数化测试, 为`Junit4`的参数化提供了更多可能 , 如 字符串数组方式,
    文件扩展方式,当然还有自定义的参数化方式.  `数据驱动`也是自动化框架的核心部分.
     
1. [Allure2](http://allure.qatools.ru/) :   
    这是一款开源的, 最美轮美奂的 report 工具 .
    虽然目前官方还没有 `AndroidJunit4` 的支持版本 , 
    但并不妨碍我们使用(关于扩展 , 我们后面再讲). 
    我们先来看一下报告的效果:  
    总览  
    ![总览](/screenshot/espresso/ui02/allure_o.png)  
    详细  
    ![详细](/screenshot/espresso/ui02/allure_d.png)  
    更多效果请看[官方示例](https://ci.qameta.io/job/allure2/job/master/Demo2_20Report/).  
    
    
---  

蓝图就先绘制到这里,后面我们将一步步完成这个框架