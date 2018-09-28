---
layout: post
title: '基于Espresso的Android UI自动化框架设计之六'
subtitle: '自动构建 -- 按一定的策略定期构建测试并生成报告'
date: 2018-09-28
author: 雨落寒霜
tags: espresso Android UI自动化 测试报告 Allure Jenkins
---
> 自动化的方式就是要解放手工。定期自动构建，只关注最终的测试输出（Allure + Jenkins 
可以在测试完成后自动生成报告，并记录历史和趋势），这将是很惬意的。  

本系列项目位于`github:` [https://github.com/rawqing/EspressoBlackBoxDemo](https://github.com/rawqing/EspressoBlackBoxDemo)

### 一、配置Allure plugin  
Jenkins 的安装和设置这里就不说了。
 1. 添加`Allure`插件  
    在可选插件中搜索 `Allure` 并安装  
    ![插件安装](/screenshot/espresso/ui06/allure-plugin-install.jpg)  
 2. 配置插件  
    在全局工具配置 中找到	`Allure Commandline`    
    ![allure-cmd](/screenshot/espresso/ui06/allure-cmd.jpg)  
    填写别名（可随意填写）、安装目录（allure的安装目录）、取消自动安装  
    
### 二、创建 Jenkins 任务 
 1. 源码管理写上我们项目在 github 上的 url  
    ![](/screenshot/espresso/ui06/source-m.jpg)  
 1. 构建过程    
    我们使用 `Commandline` 的方式运行测试。被测apk和测试apk以安装至手机，所以
    我们去除编译和安装的步骤以节省时间。  
    ![](/screenshot/espresso/ui06/cmd-run.jpg)  
    
    **附：安装apk的方法**    
    build：（执行gradle task）  
    ```groovy
    clean assembleDebugAndroidTest
    ```  
    安装 apk：（Window 使用cmd命令行构建 ；
    Linux or Mac 使用 shell脚本构建）

    ```groovy
    adb push /data/work/androidSpace/EspressoBlackBoxDemo/app/build/outputs/apk/debug/app-debug.apk /data/local/tmp/yq.test.logindemo
    adb shell pm install -t -r "/data/local/tmp/yq.test.logindemo"
    
    adb push /data/work/androidSpace/EspressoBlackBoxDemo/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk /data/local/tmp/yq.test.logindemo.test
    adb shell pm install -t -r "/data/local/tmp/yq.test.logindemo.test"
    ```  
    运行测试：（Window 使用cmd命令行构建 ；Linux or Mac 使用 shell脚本构建）  
    ```groovy 
    adb shell am instrument -w -r   -e debug false -e class 'yq.test.espressoblackboxdemo.testSuites.ExampleSuite' yq.test.logindemo.test/com.yq.allure2_androidj.android.runner.AllureAndroidRunner
    ```  
 1. 报告生成  
    在 "构建后操作" 中添加 `Allure Report` 构建 ，Path 为上一步pull的测试结果的目录的相对路径或绝对路径。   
    ![](/screenshot/espresso/ui06/jenkins_allure_set.jpg)  
    
### 三、收获报告
我们手动多构建几次，方便看得更清楚（当然，实际工作中都会使用一定的策略来触发构建）  
Jenkins任务详情页的趋势图：  
![](/screenshot/espresso/ui06/jenkins_trend.jpg)  
Allure首页的趋势图：  
![](/screenshot/espresso/ui06/allure-trend.jpg)  
Allure的历史记录：  
![](/screenshot/espresso/ui06/allure-history.jpg)  

