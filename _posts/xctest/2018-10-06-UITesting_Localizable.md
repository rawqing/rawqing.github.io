---
layout: post
title: 'Ios UITesting - 本地化你的测试 (Localizable)'
subtitle: '为测试代码添加多语言支持'
date: 2018-10-06
author: 雨落寒霜
tags: XCTest UITesting UI自动化 ios自动化 Localizable 本地化
---
> 对于支持多语言的app来说，测试的时候也要考虑多语言（比如提示消息，文本校验等）

### 一、创建本地化文件  
在项目 `info` -> `Localizations` 中添加多语言  
![](/screenshot/xctest/181006/info.png)  
如添加"简中"  
![](/screenshot/xctest/181006/chinese_s.png)  
直接点击 `Finish`  
再添加 "繁中" （方法同上）    
结果如下:  
![](/screenshot/xctest/181006/localizations_res.png)  
然后直接在UITests target中新建文件 , 选择 `Resource` 中的 `Strings File`   
![](/screenshot/xctest/181006/create_strings.png)  
点击 `Next`   
设置文件名称为 `Localizable` , 选好 group 和 target ：  
![](/screenshot/xctest/181006/create_localizable.png)  
点击 `Create`  
选中创建 `Localizable.strings` 文件展开 xcode 右侧栏 ,
并选中 `Localizable.strings` 文件  
![](/screenshot/xctest/181006/local_right.png)  
点击 `Localize...` button 后:  
![](/screenshot/xctest/181006/select.png)  
随便选择一项，进入下一步  
然后将右侧三种语言都选上之后 , `Localizable.strings` 下将出现对应的三个文件 :  
![](/screenshot/xctest/181006/all_strings.png)  

### 二、	书写本地化文件
注意格式 和 结尾的 分号 `;`  
EN:  
![](/screenshot/xctest/181006/en.png)  
ZH_CN:  
![](/screenshot/xctest/181006/zh_cn.png)  
ZH_TW:
![](/screenshot/xctest/181006/zh_tw.png)    
***扩展：***格式也可以这样写 `cancel = "取消";`   

### 三、编写测试代码  
创建一个 UI Test Case Class , 或者直接在示例的UI Test Case Class 中直接书写，
我们将手机的语言环境设置成 `中文` ，然后测试一遍。  
![](/screenshot/xctest/181006/testClass.png)  
**测试成功。**  
code source:  
```Swift
import XCTest
 
class LocalUITests: XCTestCase {        
   
    func testExample() {
        let lb = Bundle(for: LocalUITests.self)
//        也可以这样写
//        let lb = Bundle(for: self.classForCoder)
        let localDone = NSLocalizedString("done", bundle: lb ,comment: "")
        
        print("\nlocalDone : \(localDone)\n")
    }
    
}
```  
**注：**  
 `let lb = Bundle(for:BaseTest.self)`  这里还可以使用继承了 
 `XCTestCase` 的基类 `BaseTest`。  
如下所示(可以是空类) , 后续的方法会常用到：  
```swift
import XCTest

class BaseTest : XCTestCase {
    
}
```  
    
### 封装扩展  
+ 方法一、使用类方法  
定义一个 Handler 类(类名可以任意) 封装一个方法  
    ```swift
    import XCTest
     
    class Handler {
     
        class open func local(_ key:String) -> String {
            let lb = Bundle(for:BaseTest.self)
            return NSLocalizedString(key, bundle:lb,comment: "find \(self) local string .")
        }
    }
    ```  
+ 方法二、使用扩展  
扩展 `String` 这个类的 `方法` 或者 `属性`  
    1. 属性  
    ```swift
    extension String{
        var local: String{
            let lb = Bundle(for: BaseTest.self)
            return NSLocalizedString(self, bundle: lb ,comment: "find \(self) local string .")
        }
    }
    ```  
    2. 方法  
    ```swift
    extension String{
        func fLocal()-> String{
                let lb = Bundle(for: BaseTest.self)
                return NSLocalizedString(self, bundle: lb ,comment: "find \(self) local string .")
            }
    }
    ```   
    
最后我们统一调用一下来展示结果吧 , 偷个懒 ^-^||   
```swift
import XCTest

class XCUIDemoUITests: XCTestCase {
    
    func testExample() {
        
        print("\n class func localDone : \(Handler.local("done"))\n")
        
        print("\n extension field localDone : \("done".local)\n")
        
        print("\n extension func localDone : \("done".fLocal())\n")

    }
}
```  
测试输出：  
![](/screenshot/xctest/181006/end_output.jpg)  
完美收工


    







