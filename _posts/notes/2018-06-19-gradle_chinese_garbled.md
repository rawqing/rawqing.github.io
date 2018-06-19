---
layout: post
title: 'Gradle项目中文乱码的多种解决方案'
date: 2018-06-19
author: 落雨寒霜
tags: gradle idea
---
#### 方案一:
 工作空间设置 utf-8 模式 (但实际上很多时候并没有什么用)
#### 方案二:
 编译时不识别中文注释在 build.gradle 中最外层 加上如下代码:
```groovy
tasks.withType(JavaCompile){
    options.encoding='UTF-8'
}
```
#### 方案三:
还有一些情况比较特殊 , 在IDE中运行编码是正常 , 但使用`gradle task`来运行时, 
中文就乱码了. 多出现在所读取的外部文件内容包含中文的情况下.  
使用如下配置(Gradle VM Options设置为`-Dfile.encoding=utf-8`)再运行`gradle task`也就正常了.

![](/screenshot/notes/20180619-gradle_chinese_garbled01.png) 

#### 方案四:
若在没有ide的情况下 , 怎么设置呢 . 经试验 文中提到的配置环境变量的方法并没有起效 
( 如在`jenkins`中 )那么还是用如下方法则可以解决
![](/screenshot/notes/20180619-gradle_chinese_garbled02.png)

	直接在task 后面加上  -Dfile.encoding=utf-8  即可搞定.
