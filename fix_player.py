#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复 player.html 中的课程播放问题
1. 增强 populatePlayerPage 函数的容错性
2. 修复视频 URL 路径处理
3. 确保大纲点击正常工作
"""

import re
import sys

def fix_player_html():
    file_path = 'E:/培训相关/桌面/learning/player.html'
    
    # 读取文件
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print("正在修复 player.html...")
    
    # 修复1: 增强 populatePlayerPage 函数的视频加载逻辑
    old_video_logic = '''            const videoEl = document.getElementById('course-video');
            const sourceEl = document.getElementById('video-source');
            videoEl.poster = course.cover || `https://placehold.co/1280x720/667eea/ffffff?text=${encodeURIComponent(course.title || '课程')}`;
            const firstVideo = (course.videos && course.videos.length > 0) ? course.videos[0] : null;
            const videoUrl = (firstVideo && firstVideo.url) || course.video || 'https://www.w3schools.com/html/mov_bbb.mp4';
            sourceEl.src = videoUrl;
            if (firstVideo) videoEl.load();'''
    
    new_video_logic = '''            const videoEl = document.getElementById('course-video');
            const sourceEl = document.getElementById('video-source');
            videoEl.poster = course.cover || `https://placehold.co/1280x720/667eea/ffffff?text=${encodeURIComponent(course.title || '课程')}`;
            
            // 增强容错：如果 videos 为空但存在 video 字段，构造虚拟 videos 数组
            let videos = course.videos;
            if (!videos || videos.length === 0) {
                if (course.video) {
                    videos = [{
                        url: course.video,
                        title: course.title || '课时 1',
                        duration: course.duration || 0
                    }];
                    // 更新 currentCourseData 以便后续使用
                    currentCourseData.videos = videos;
                } else {
                    videos = [];
                }
            }
            
            const firstVideo = videos.length > 0 ? videos[0] : null;
            let videoUrl = '';
            if (firstVideo && firstVideo.url) {
                videoUrl = firstVideo.url;
                // 确保相对路径正确（以 / 开头）
                if (!videoUrl.startsWith('http') && !videoUrl.startsWith('/')) {
                    videoUrl = '/' + videoUrl;
                }
            } else if (course.video) {
                videoUrl = course.video;
                if (!videoUrl.startsWith('http') && !videoUrl.startsWith('/')) {
                    videoUrl = '/' + videoUrl;
                }
            } else {
                videoUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
            }
            
            sourceEl.src = videoUrl;
            if (firstVideo) {
                videoEl.load();
            }'''
    
    if old_video_logic in content:
        content = content.replace(old_video_logic, new_video_logic)
        print("✓ 修复了视频加载逻辑")
    else:
        print("⚠ 未找到需要修复的视频加载逻辑（可能已修复或格式不同）")
    
    # 修复2: 更新 videos 变量的赋值逻辑
    old_videos_assign = '''            const videos = course.videos || [];'''
    new_videos_assign = '''            // videos 已在前面处理过，这里直接使用
            // const videos = course.videos || [];'''
    
    if old_videos_assign in content and 'let videos = course.videos;' in content:
        # 如果已经在前面的修复中定义了 videos，则注释掉这行
        content = content.replace(old_videos_assign, new_videos_assign)
        print("✓ 更新了 videos 变量赋值")
    
    # 修复3: 增强 playChapterVideo 函数的容错性
    old_play_chapter = '''        function playChapterVideo(videoIdx) {
            const api = window.DataAPI;
            const courseData = currentCourseData || api.getCourse(courseId);
            const videos = courseData?.videos || [];
            const v = videos[videoIdx];
            if (!v) {
                showToast('无法播放该视频，请刷新页面重试');
                return;
            }'''
    
    new_play_chapter = '''        function playChapterVideo(videoIdx) {
            const api = window.DataAPI;
            let courseData = currentCourseData || api.getCourse(courseId);
            let videos = courseData?.videos || [];
            
            // 容错处理：如果 videos 为空但存在 video 字段，构造虚拟数组
            if (!videos || videos.length === 0) {
                if (courseData && courseData.video) {
                    videos = [{
                        url: courseData.video,
                        title: courseData.title || '课时 1',
                        duration: courseData.duration || 0
                    }];
                    courseData.videos = videos;
                    currentCourseData = courseData;
                }
            }
            
            const v = videos[videoIdx];
            if (!v) {
                showToast('无法播放该视频，请刷新页面重试');
                return;
            }'''
    
    if old_play_chapter in content:
        content = content.replace(old_play_chapter, new_play_chapter)
        print("✓ 修复了 playChapterVideo 函数")
    else:
        print("⚠ 未找到需要修复的 playChapterVideo 函数")
    
    # 保存文件
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("\n✅ 修复完成！请刷新浏览器测试课程播放功能。")
    print("\n修复内容：")
    print("1. 增强了视频加载逻辑，支持单视频课程（course.video 字段）")
    print("2. 自动为缺少 videos 数组的课程构造虚拟数组")
    print("3. 修正了视频 URL 路径处理（确保以 / 开头）")
    print("4. 增强了 playChapterVideo 函数的容错性")

if __name__ == '__main__':
    try:
        fix_player_html()
    except Exception as e:
        print(f"❌ 修复失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
