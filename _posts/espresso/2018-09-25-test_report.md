---
layout: post
title: '基于Espresso的Android UI自动化框架设计之五'
subtitle: '测试报告 -- 一份美好的报告是自动化测试的丰收'
date: 2018-09-25
author: 雨落寒霜
tags: espresso Android UI自动化 测试报告 Allure
---
> 自动化测试的最终结果往往需要一份更好的报告来展示。对于UI自动化来说，错误截图是必须的。
 [square/spoon](https://github.com/square/spoon)是一个和`espresso`搭配不错的项目,
 如果是白盒测试的话当是首先，至于黑盒使用`spoon`的方式还有待研究。

本系列项目位于`github:` [https://github.com/rawqing/EspressoBlackBoxDemo](https://github.com/rawqing/EspressoBlackBoxDemo)

### 一、工具选取  
[Allure2](http://allure.qatools.ru/)是一款很好的测试报告生成工具，已经支持很多测试框架，
但遗憾的是在`Android`暂无法运行。  
当然github上也有非官方的`allure-android`的项目
[TinkoffCreditSystems/allure-android](https://github.com/TinkoffCreditSystems/allure-android)
这是一个纯`kotlin`的项目，对于某些不支持该语言的项目来说，将是非常头疼的。  
[rawqing/allure2android](https://github.com/rawqing/allure2android)
这是我自己仿照`Allure2`改造过来的支持`Android`的项目，使用习惯与`Allure2`类似，
部分功能还有待完善，但基础功能还是可以的。   

### 二、工具集成  
1. 修改项目下的`build.gradle`文件  
添加一个`maven`远程仓库  
    ```groovy
    allprojects {
        repositories {
            google()
            jcenter()
            maven { url 'https://dl.bintray.com/yqing/maven'}
        }
    }
    ```  
1. 修改`app`下的`build.gradle`文件  
    1. 添加依赖  
        ```groovy
        androidTestImplementation 'yq.allure2android:allure2-androidj:1.0.5@aar'
        androidTestImplementation 'com.google.code.gson:gson:2.8.2'
        androidTestImplementation 'com.android.support.test.uiautomator:uiautomator-v18:2.1.3'
        ```  
    1. 修改测试执行的入口
        ```groovy
        //     testInstrumentationRunner "android.support.test.runner.AndroidJUnitRunner"
        testInstrumentationRunner "com.yq.allure2_androidj.android.runner.AllureAndroidRunner"
        ```  
    1. 添加`java8`的支持  
    最终如下：
        ```groovy
        android {
            compileSdkVersion 27
            defaultConfig {
                applicationId "yq.test.logindemo"
                minSdkVersion 24
                targetSdkVersion 27
                versionCode 1
                versionName "1.0"
        //        testInstrumentationRunner "android.support.test.runner.AndroidJUnitRunner"
                testInstrumentationRunner "com.yq.allure2_androidj.android.runner.AllureAndroidRunner"
            }
            buildTypes {
                release {
                    minifyEnabled false
                    proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
                }
            }
           // 添加 java8 的支持
            compileOptions {
                sourceCompatibility 1.8
                targetCompatibility 1.8
            }
        }
        ```
 1. 我们还需要修改一下被测`apk`   
    在`AndroidManifest.xml`中添加文件读写权限：  
    ```xml
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    ```  
    否则将不能读写测试结果文件。   
    然后将`apks`目录下的`login_debug.apk`文件替换成**新的**  
    
### 三、表演开始  
 1. 像往常一样运行一下测试  
 然后通过`adb shell`查看一下我们的测试结果  
 ![结果文件](/screenshot/espresso/ui05/res_files.jpg)    
 上图中的`json`文件就是 allure 生成的测试结果文件
 1. 拉取文件  
    在当前项目根目录下执行命令：
    ```
    adb pull /sdcard/allure-results ./
    ```  
    完成后项目将多出`allure-results`目录：  
    ![](/screenshot/espresso/ui05/res_dir.jpg)  
 1. 解析结果文件，并生成报告  
    注：allure 的安装请自行参见[官方文档](https://docs.qameta.io/allure/)
    这里就不赘述了。  
    直接在`Android studio`的`Terminal`中输入命令：  
    ```
    allure serve allure-results
    ```
    ![命令结果](/screenshot/espresso/ui05/test_report.jpg)  
    执行成功后默认浏览器会打开测试结果页面（若没自动打开，则将`Server started at `后面的 url 复制到浏览器打开即可。
    结果如图：  
    ![](/screenshot/espresso/ui05/rep_html.jpg)  
    
### 四、继续优化  
 结果已经出来了，虽然报告中还有很多项是空的（没有内容），没关系，我们继续填充。  
 1. 添加"功能"  
 给测试类加上`Epic` `Feature` 注解：
    ```java
    @RunWith(JUnitParamsRunner::class)
    @Epic("登录")
    @Feature("参数化的")
    class LoginParameterizedTest { ... }
    ```   
    给测试方法加上 `DisplayName` 注解：  
    ```java
    @Test
    @DisplayName("无参的登录测试")
    fun loginTest(){
        val login = LoginView()
        login
                .doLogin("hello" ,"")
                .checkLoginError("This email address is invalid" ,atr)
    }
    ```  
 1. 多创建几个测试，并添加一个测试集  
    新建 `ExampleSuite.kt` class ：
    ```java
    package yq.test.espressoblackboxdemo.testSuites
    
    import org.junit.runner.RunWith
    import org.junit.runners.Suite
    import yq.test.espressoblackboxdemo.tests.LoginParameterizedTest
    import yq.test.espressoblackboxdemo.tests.LoginTest
    
    @RunWith(Suite::class)
    @Suite.SuiteClasses(
            LoginTest::class,
            LoginParameterizedTest::class
    )
    class ExampleSuite {
    }
    ```  
 1. 添加错误截图的支持  
    修改 `ViewElement.kt` 的二次封装部分，改为：  
    ```java
        /** 二次封装部分 **/
    
        fun replaceText(text: String): ViewElement {
            catchThrow {
                this.createInteraction()?.perform(ViewActions.replaceText(text))
            }
            return this
        }
    
        fun click(): ViewElement {
            catchThrow { this.createInteraction()?.perform(ViewActions.click()) }
            return this
        }
    
    
        fun check(viewAssertion: ViewAssertion): ViewElement {
            catchThrow{ this.createInteraction()?.check(viewAssertion) }
    //        this.createInteraction()?.check(viewAssertion)
            return this
        }
    
        /**
         * 添加错误截图
         */
        private fun catchThrow(something: ()-> Unit) {
            try {
                something()
            } catch (t: Throwable) {
                val imagePath = Allure.addAttachment("${Date().time} | error take screenshot")
                Log.i(TAG,"imagePath: $imagePath")
                throw t
            }
        }

    ```
最后，重复之前的拉取测试结果、解析生成报告的操作，然后我们在浏览器中就能看到如下图的样子了：  
![](/screenshot/espresso/ui05/end_html.jpg)  
错误截图，堆栈信息，用例名称（部分）等都已经有了，是不是很美好，还有很多地方
是可以继续扩展的（比如优先级、失败重试等）。  
手动解析生成报告很麻烦？不用着急，下一节我们将讲解 Allure 与 jenkins 的配合使用。

### 未支持部分  
 1. AOP 模式
 1. 参数提取
 1. Step
 1. Logcat 提取
 1. 使用参数化的 case 无法展示自定义名称:  
 这时由于`JUnitParams`工具的一
 点缺陷导致无法获取到 `@DisplayName` 注解的内容。  
    可使用修改后的工程:   
`androidTestImplementation 'pl.pragmatists:JUnitParams:1.1.2.3'`   
 maven 配置：  
 `maven { url 'https://dl.bintray.com/yqing/maven'}`