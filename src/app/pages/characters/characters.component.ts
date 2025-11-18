import { Component, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  startWith,
  tap,
} from 'rxjs/operators';
import { Observable, Subscription, of } from 'rxjs';

// ক্যারেক্টার ডেটার জন্য ইন্টারফেস
interface Character {
  id: number;
  name: string;
  status: string;
  species: string;
  gender: string;
  // অন্যান্য ফিল্ড
}

// API রেসপন্সের জন্য ইন্টারফেস
interface ApiResponse {
  info: {
    count: number;
    pages: number;
    next: string | null;
    prev: string | null;
  };
  results: Character[];
}

// স্টেট দেখানোর জন্য এনুম
enum CharacterState {
  LOADING,
  LOADED,
  NO_DATA_FOUND,
  ERROR,
}

@Component({
  selector: 'app-characters',
  imports: [ReactiveFormsModule, FormsModule, PaginationModule],
  templateUrl: './characters.component.html',
  styleUrl: './characters.component.scss',
})
export class CharactersComponent {
  searchControl = new FormControl('', { nonNullable: true });
  pageControl = new FormControl(1, { nonNullable: true });

  totalItems = signal(0);


  private readonly API_URL = 'https://rickandmortyapi.com/api/character';
  private subscriptions = new Subscription();

  // ক্যারেক্টার ডেটা রাখার জন্য সিগন্যাল
  characters = signal<Character[]>([]);
  // বর্তমান অবস্থা (LOADING, LOADED, ইত্যাদি) দেখানোর জন্য সিগন্যাল
  state = signal<CharacterState>(CharacterState.LOADING);
  
  // এনুমটিকে টেমপ্লেটে ব্যবহারের জন্য সহজ করে রাখা
  readonly CharacterState = CharacterState; 

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    // # ১: পেজ পরিবর্তন হলে ডেটা লোড করা (pageControl-এর পরিবর্তন ট্র্যাক করা)
    const pageChange$ = this.pageControl.valueChanges.pipe(
      // যখনই pageControl-এর মান পরিবর্তন হবে, তখনই ডেটা লোড হবে
      // debounceTime(0) ব্যবহার করা হয়েছে যাতে ngOnInit-এ প্রাথমিক লোড নিশ্চিত হয়
      startWith(this.pageControl.value)
    );

    // # ২: সার্চ ফিল্ডের পরিবর্তন ট্র্যাক করা
    const searchChange$ = this.searchControl.valueChanges.pipe(
      // সার্চে একটি বিলম্ব (Debounce) যোগ করা হয়েছে
      debounceTime(200),
      // একই সার্চ বারবার না করার জন্য
      distinctUntilChanged(),
      // সার্চ ভ্যালু পরিবর্তন হলে পেজকে ১-এ রিসেট করা
      tap(() => {
        // যদি current page 1 না হয়, তাহলে 1 সেট করুন।
        // যদি current page 1 হয়, তাহলে pageControl.valueChanges ইভেন্ট ফায়ার হবে না।
        // সেক্ষেত্র initial load/pageChange$ কাজ করবে।
        if (this.pageControl.value !== 1) {
            this.pageControl.setValue(1, { emitEvent: false }); // পেজ ১ সেট করা হলো, কিন্তু ইভেন্ট ফায়ার হলো না
        }
      }),
      // pageControl-এর মান ১-এ রিসেট করার পর,
      // pageControl-এর বর্তমান মান দিয়ে একটি ইভেন্ট ফায়ার করা (যাতে লোড শুরু হয়)
      startWith(this.pageControl.value) // এখানে মূলত search value নয়, বরং লোড শুরু করার জন্য 1 (বা বর্তমান পেজ) পাঠানো হচ্ছে।
    );

    // # ৩: সার্চ এবং পেজ পরিবর্তনের সমন্বয় করে ডেটা লোড করা
    const loadData$ = searchChange$.pipe(
      // switchMap সবচেয়ে গুরুত্বপূর্ণ। এটি নতুন কোনো রিকোয়েস্ট আসার সাথে সাথে আগের
      // কোনো পেন্ডিং রিকোয়েস্টকে বাতিল (cancel) করে দেয়।
      // আমরা এখানে pageControl-এর পরিবর্তনকেও পর্যবেক্ষণ করব, কারণ setValue(1) করার পরও লোড হতে হবে।
      switchMap(() => pageChange$.pipe(
        // switchMap-এর মধ্যে switchMap ব্যবহার করা হলো যাতে search change হলে debounceTime(500) কাজ করে,
        // আর searchChange-এর পর পেজ ১-এ রিসেট হলে loadData কল হয়।
        // এর পরিবর্তে combineLatest ব্যবহার করা যেতে পারত, কিন্তু এই approach-এ কন্ট্রোল ভালো থাকে।
        
        // এখানে মূল ডেটা লোড করার লজিক
        switchMap((page) => {
          this.state.set(CharacterState.LOADING); // লোডিং স্টেট সেট করা
          this.characters.set([]); // পুরোনো ডেটা মুছে ফেলা

          const params = new HttpParams()
            .set('page', page.toString())
            .set('name', this.searchControl.value);

          return this.fetchCharacters(params);
        })
      ))
    );

    // সাবস্ক্রাইব করা এবং ত্রুটি হ্যান্ডেল করা
    this.subscriptions.add(
      loadData$.subscribe({
        next: (response: ApiResponse) => {
          this.characters.set(response.results);
          this.totalItems.set(response.info.count);
          this.state.set(CharacterState.LOADED);
        },
        error: (err) => {
          // ত্রুটি বা ডেটা না পেলে এই ব্লকটি কাজ করবে
          console.error('Data fetching error:', err);
          this.characters.set([]);
          this.totalItems.set(0);

          // API 404 error দিলে 'no characters found' স্টেট সেট করা
          if (err.status === 404) {
             this.state.set(CharacterState.NO_DATA_FOUND);
          } else {
             this.state.set(CharacterState.ERROR);
          }
        },
      })
    );
  }

  // API থেকে ডেটা আনার ফাংশন
  private fetchCharacters(params: HttpParams): Observable<ApiResponse> {
    return this.http.get<ApiResponse>(this.API_URL, { params }).pipe(
      catchError((err) => {
        // HTTP 404 (Not Found) এর জন্য এটি একটি সাধারণ উপায়। 
        // এটিই API-তে কোনো ডেটা না পাওয়ার স্ট্যান্ডার্ড রেসপন্স।
        if (err.status === 404) {
          // 404 এর ক্ষেত্রেও যেন observable stream চলতে থাকে, তাই `of` ব্যবহার করা হলো।
          // তবে, ngOnInit-এ error হ্যান্ডলিং ব্লকটি 404 ধরার জন্য আরও ভালো।
          // এখানে শুধু error টি re-throw করা হলো যাতে বাইরের সাবস্ক্রাইবার এটি হ্যান্ডেল করতে পারে।
          throw err; 
        }
        // অন্যান্য ত্রুটি হ্যান্ডেল করা
        return of(err);
      })
    );
  }

  // কম্পোনেন্ট ধ্বংস হওয়ার আগে সাবস্ক্রিপশন বাতিল করা
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
  // here's the task:
  // the page will initially call an api to load the character list
  // the data is paginated, so when the page is changed, you need to load the data of that page
  // when the user types anything in the search field, it also needs to search, the page needs to be resetted to 1
  // search requests should be debounced, and should cancel any previous pending request

  // the api url is:
  // https://rickandmortyapi.com/api/character
  // the search and page data needs to be send in the query params
  // it will be seomthing like this: { name: "searchedValue" or null, page: pageValue }
}
